import {
  FINSEC_SNAPSHOT_INPUT_PREFIX,
  MAX_PINE_INPUT_CHARACTERS,
  type ApplyStrategyMessage,
  type ApplyStrategyResponse,
} from '@/finsec-message';

type Confirmation = {
  scope: HTMLElement;
  button: HTMLElement;
};

export default defineContentScript({
  matches: ['https://*.tradingview.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isApplyStrategyMessage(message)) return undefined;
      return applyStrategy(message.rows);
    });
  },
});

function isApplyStrategyMessage(
  message: unknown,
): message is ApplyStrategyMessage {
  if (typeof message !== 'object' || message === null) return false;

  const candidate = message as Partial<ApplyStrategyMessage>;
  return (
    candidate.type === 'FINSEC_APPLY_STRATEGY' &&
    Array.isArray(candidate.rows) &&
    candidate.rows.every((row) => typeof row === 'string')
  );
}

async function applyStrategy(rows: string[]): Promise<ApplyStrategyResponse> {
  if (rows.length === 0) {
    return { ok: false, message: 'The pending strategy has no snapshots.' };
  }

  const oversizedRow = rows.findIndex(
    (row) => row.length > MAX_PINE_INPUT_CHARACTERS,
  );
  if (oversizedRow !== -1) {
    return {
      ok: false,
      message: `Snapshot ${oversizedRow + 1} exceeds the ${MAX_PINE_INPUT_CHARACTERS.toLocaleString()}-character Pine string limit.`,
    };
  }

  if (rows.some((row) => row.length === 0)) {
    return { ok: false, message: 'The pending strategy contains an empty row.' };
  }

  const slots = collectSnapshotSlots();
  if (slots.size === 0) {
    return {
      ok: false,
      message: `Open the Finsec indicator’s Settings → Inputs tab. No numbered “${FINSEC_SNAPSHOT_INPUT_PREFIX}001” text areas were found.`,
    };
  }

  for (const [slot, inputs] of slots) {
    if (inputs.length > 1) {
      return {
        ok: false,
        message: `More than one visible input is named “${formatSnapshotTitle(slot)}”. Close the other indicator settings and try again.`,
      };
    }
  }

  const requiredInputs: HTMLTextAreaElement[] = [];
  for (let slot = 1; slot <= rows.length; slot += 1) {
    const input = slots.get(slot)?.[0];
    if (!input) {
      return {
        ok: false,
        message: `The CSV needs ${rows.length} snapshot inputs, but “${formatSnapshotTitle(slot)}” is missing.`,
      };
    }
    requiredInputs.push(input);
  }

  const confirmation = findConfirmation(requiredInputs[0]!);
  if (!confirmation) {
    return {
      ok: false,
      message:
        'The Finsec snapshot inputs were found, but their TradingView OK button was not. The upload was kept.',
    };
  }

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (!valueSetter) {
    return {
      ok: false,
      message: 'TradingView’s snapshot inputs could not be updated.',
    };
  }

  const assignments = requiredInputs.map((input, index) => ({
    input,
    value: rows[index]!,
  }));

  for (const [slot, inputs] of slots) {
    if (slot > rows.length) {
      assignments.push({ input: inputs[0]!, value: '' });
    }
  }

  const originalValues = assignments.map(({ input }) => ({
    input,
    value: input.value,
  }));

  for (const assignment of assignments) {
    updateTextArea(assignment.input, assignment.value, valueSetter);
    if (assignment.input.value !== assignment.value) {
      for (const original of originalValues) {
        updateTextArea(original.input, original.value, valueSetter);
      }
      return {
        ok: false,
        message:
          'TradingView rejected one of the snapshot rows. The prior input values were restored and the upload was kept.',
      };
    }
  }

  assignments.at(-1)?.input.blur();
  confirmation.button.click();

  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    if (
      !requiredInputs[0]!.isConnected ||
      !confirmation.scope.isConnected ||
      !isVisible(confirmation.scope)
    ) {
      return { ok: true, appliedRows: rows.length };
    }
  }

  return {
    ok: false,
    message:
      'TradingView did not close the indicator settings after OK. The upload was kept.',
  };
}

function collectSnapshotSlots(): Map<number, HTMLTextAreaElement[]> {
  const slots = new Map<number, HTMLTextAreaElement[]>();

  for (const element of document.querySelectorAll('textarea')) {
    if (!(element instanceof HTMLTextAreaElement) || !isVisible(element)) {
      continue;
    }

    const slot = findSnapshotSlot(element);
    if (slot === undefined) continue;

    const inputs = slots.get(slot) ?? [];
    inputs.push(element);
    slots.set(slot, inputs);
  }

  return slots;
}

function findSnapshotSlot(input: HTMLTextAreaElement): number | undefined {
  const directLabels = [
    input.getAttribute('aria-label'),
    input.getAttribute('title'),
    ...Array.from(input.labels ?? [], (label) => label.textContent),
  ];

  const labelledBy = input.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      directLabels.push(document.getElementById(id)?.textContent ?? null);
    }
  }

  for (const label of directLabels) {
    const slot = parseSnapshotSlot(label);
    if (slot !== undefined) return slot;
  }

  let container = input.parentElement;
  while (container) {
    if (container.querySelectorAll('textarea').length === 1) {
      for (const element of container.querySelectorAll(
        'label, span, div, p',
      )) {
        const slot = parseSnapshotSlot(element.textContent);
        if (slot !== undefined) return slot;
      }
    }

    if (container.getAttribute('role') === 'dialog') break;
    container = container.parentElement;
  }

  return undefined;
}

function parseSnapshotSlot(value: string | null | undefined): number | undefined {
  const match = normalizeText(value).match(/^finsec snapshot ([0-9]+)$/);
  if (!match) return undefined;

  const slot = Number(match[1]);
  return Number.isSafeInteger(slot) && slot > 0 ? slot : undefined;
}

function formatSnapshotTitle(slot: number): string {
  return `${FINSEC_SNAPSHOT_INPUT_PREFIX}${slot.toString().padStart(3, '0')}`;
}

function updateTextArea(
  input: HTMLTextAreaElement,
  value: string,
  valueSetter: (this: HTMLTextAreaElement, value: string) => void,
) {
  input.focus();
  valueSetter.call(input, value);
  input.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      data: value,
      inputType: 'insertText',
    }),
  );
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findConfirmation(input: HTMLTextAreaElement): Confirmation | undefined {
  let scope = input.parentElement;

  while (scope && scope !== document.body) {
    const buttons = Array.from(
      scope.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ).filter(
      (button) =>
        normalizeText(button.textContent) === 'ok' &&
        isVisible(button) &&
        button.getAttribute('aria-disabled') !== 'true' &&
        !(button instanceof HTMLButtonElement && button.disabled),
    );

    if (buttons.length === 1) {
      return { scope, button: buttons[0]! };
    }

    scope = scope.parentElement;
  }

  return undefined;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLocaleLowerCase() ?? '';
}
