import './style.css';
import {
  MAX_PINE_INPUT_CHARACTERS,
  type ApplyStrategyMessage,
  type ApplyStrategyResponse,
} from '@/finsec-message';
import { parseFinsecStrategyCsv } from '@/strategy-csv';

const STORAGE_KEY = 'finsecPendingStrategy';

type PendingStrategy = {
  fileName: string;
  rows: string[];
};

const fileInput = document.querySelector<HTMLInputElement>('#strategy-file')!;
const pendingState = document.querySelector<HTMLSpanElement>('#pending-state')!;
const fileName = document.querySelector<HTMLParagraphElement>('#file-name')!;
const datasetSummary =
  document.querySelector<HTMLParagraphElement>('#dataset-summary')!;
const characterCount =
  document.querySelector<HTMLParagraphElement>('#character-count')!;
const applyButton = document.querySelector<HTMLButtonElement>('#apply')!;
const discardButton = document.querySelector<HTMLButtonElement>('#discard')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const termsDialog =
  document.querySelector<HTMLDialogElement>('#terms-dialog')!;
const termsConsent =
  document.querySelector<HTMLInputElement>('#terms-consent')!;
const termsCancelButton =
  document.querySelector<HTMLButtonElement>('#terms-cancel')!;
const termsApplyButton =
  document.querySelector<HTMLButtonElement>('#terms-apply')!;

let pendingStrategy: PendingStrategy | undefined;
let busy = false;

function renderPendingStrategy() {
  const hasPendingStrategy = pendingStrategy !== undefined;
  const rows = pendingStrategy?.rows ?? [];
  const combinedCharacters = rows.reduce(
    (total, row) => total + row.length,
    0,
  );
  const longestRowCharacters = rows.reduce(
    (longest, row) => Math.max(longest, row.length),
    0,
  );

  pendingState.textContent = hasPendingStrategy ? 'Ready' : 'Empty';
  pendingState.classList.toggle('ready', hasPendingStrategy);
  fileName.textContent = pendingStrategy?.fileName ?? 'No strategy is stored.';
  datasetSummary.textContent = `${rows.length.toLocaleString()} snapshots · ${combinedCharacters.toLocaleString()} combined characters`;
  characterCount.textContent = `Longest row: ${longestRowCharacters.toLocaleString()} / ${MAX_PINE_INPUT_CHARACTERS.toLocaleString()} characters`;
  applyButton.disabled = !hasPendingStrategy || busy;
  discardButton.disabled = !hasPendingStrategy || busy;
  fileInput.disabled = busy;
}

function showStatus(message: string, kind: 'error' | 'success' | 'neutral') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function isPendingStrategy(value: unknown): value is PendingStrategy {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<PendingStrategy>;
  return (
    typeof candidate.fileName === 'string' &&
    Array.isArray(candidate.rows) &&
    candidate.rows.length > 0 &&
    candidate.rows.every(
      (row) =>
        typeof row === 'string' &&
        row.length > 0 &&
        row.length <= MAX_PINE_INPUT_CHARACTERS,
    )
  );
}

async function restorePendingStrategy() {
  const stored = await browser.storage.session.get(STORAGE_KEY);
  const value: unknown = stored[STORAGE_KEY];

  if (isPendingStrategy(value)) {
    pendingStrategy = value;
  } else if (value !== undefined) {
    await browser.storage.session.remove(STORAGE_KEY);
    showStatus(
      'The previous single-field upload was removed. Upload the CSV again.',
      'neutral',
    );
  }

  renderPendingStrategy();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';

  if (!file) return;

  if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
    showStatus('Select a Finsec CSV file.', 'error');
    return;
  }

  try {
    const parsed = parseFinsecStrategyCsv(await file.text());
    const oversizedRow = parsed.rows.findIndex(
      (row) => row.length > MAX_PINE_INPUT_CHARACTERS,
    );

    if (oversizedRow !== -1) {
      const length = parsed.rows[oversizedRow]!.length;
      throw new Error(
        `Snapshot ${oversizedRow + 1} has ${length.toLocaleString()} characters; one Pine string can contain ${MAX_PINE_INPUT_CHARACTERS.toLocaleString()}.`,
      );
    }

    pendingStrategy = { fileName: file.name, rows: parsed.rows };
    await browser.storage.session.set({ [STORAGE_KEY]: pendingStrategy });
    renderPendingStrategy();
    showStatus(
      `${parsed.rows.length.toLocaleString()} snapshot rows stored for this browser session.`,
      'success',
    );
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : 'That CSV could not be read.',
      'error',
    );
  }
});

discardButton.addEventListener('click', async () => {
  await browser.storage.session.remove(STORAGE_KEY);
  pendingStrategy = undefined;
  renderPendingStrategy();
  showStatus('Pending upload discarded.', 'neutral');
});

applyButton.addEventListener('click', () => {
  if (!pendingStrategy || busy) return;

  termsConsent.checked = false;
  termsApplyButton.disabled = true;
  termsDialog.showModal();
});

termsConsent.addEventListener('change', () => {
  termsApplyButton.disabled = !termsConsent.checked;
});

termsCancelButton.addEventListener('click', () => {
  termsDialog.close();
});

termsApplyButton.addEventListener('click', async () => {
  if (!termsConsent.checked) return;

  termsDialog.close();
  if (!pendingStrategy) return;

  busy = true;
  renderPendingStrategy();
  showStatus('Applying snapshot rows to TradingView…', 'neutral');

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab?.id === undefined) {
      throw new Error('Open the TradingView chart tab and try again.');
    }

    const message: ApplyStrategyMessage = {
      type: 'FINSEC_APPLY_STRATEGY',
      rows: pendingStrategy.rows,
    };
    const response = (await browser.tabs.sendMessage(
      activeTab.id,
      message,
    )) as ApplyStrategyResponse;

    if (!response?.ok) {
      throw new Error(
        response?.message ?? 'TradingView did not accept the strategy.',
      );
    }

    await browser.storage.session.remove(STORAGE_KEY);
    pendingStrategy = undefined;
    showStatus(
      `${response.appliedRows.toLocaleString()} snapshots applied. The session upload has been deleted.`,
      'success',
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The strategy was not applied.';

    showStatus(
      /receiving end|establish connection/i.test(message)
        ? 'Open or reload the TradingView chart tab, then try again.'
        : message,
      'error',
    );
  } finally {
    busy = false;
    renderPendingStrategy();
  }
});

restorePendingStrategy().catch(() => {
  showStatus('The pending browser-session upload could not be read.', 'error');
  renderPendingStrategy();
});
