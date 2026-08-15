const BASE_HEADERS = [
  'symbol',
  'label',
  'timeStart',
  'timeEnd',
  'candle_count',
  'annotatedAt',
  'candles',
] as const;

const ANNOTATIONS_HEADER = 'annotations';

export type ParsedFinsecStrategyCsv = {
  rows: string[];
};

export function parseFinsecStrategyCsv(
  source: string,
): ParsedFinsecStrategyCsv {
  const records = parseCsvRecords(source).filter(
    (record) => !(record.length === 1 && record[0] === ''),
  );

  if (records.length === 0) {
    throw new Error('That CSV is empty. Nothing was stored.');
  }

  const header = [...records[0]!];
  header[0] = header[0]?.replace(/^\uFEFF/, '') ?? '';
  const expectedHeaders =
    header.length === BASE_HEADERS.length + 1 &&
    header[BASE_HEADERS.length] === ANNOTATIONS_HEADER
      ? [...BASE_HEADERS, ANNOTATIONS_HEADER]
      : [...BASE_HEADERS];

  if (
    header.length !== expectedHeaders.length ||
    header.some((value, index) => value !== expectedHeaders[index])
  ) {
    throw new Error(
      `The CSV header must be ${BASE_HEADERS.join(',')}, with an optional final annotations column.`,
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    throw new Error('That CSV has a header but no strategy snapshots.');
  }

  let strategyLabel: string | undefined;
  const rows = dataRecords.map((record, index) => {
    const csvRowNumber = index + 2;

    if (record.length !== expectedHeaders.length) {
      throw new Error(
        `CSV row ${csvRowNumber} has ${record.length} columns; expected ${expectedHeaders.length}.`,
      );
    }

    const symbol = record[0]!.trim();
    const label = record[1]!.trim();
    const timeStart = Number(record[2]);
    const timeEnd = Number(record[3]);
    const candleCount = Number(record[4]);
    const annotatedAt = record[5]!.trim();

    if (!symbol || !label) {
      throw new Error(`CSV row ${csvRowNumber} is missing its symbol or label.`);
    }

    if (strategyLabel === undefined) {
      strategyLabel = label;
    } else if (label !== strategyLabel) {
      throw new Error(
        `CSV row ${csvRowNumber} uses label “${label}”; expected “${strategyLabel}”.`,
      );
    }

    if (
      !Number.isSafeInteger(timeStart) ||
      !Number.isSafeInteger(timeEnd) ||
      timeStart <= 0 ||
      timeEnd < timeStart
    ) {
      throw new Error(`CSV row ${csvRowNumber} has an invalid time range.`);
    }

    if (!Number.isSafeInteger(candleCount) || candleCount < 1) {
      throw new Error(`CSV row ${csvRowNumber} has an invalid candle_count.`);
    }

    if (!annotatedAt || Number.isNaN(Date.parse(annotatedAt))) {
      throw new Error(`CSV row ${csvRowNumber} has an invalid annotatedAt value.`);
    }

    const candles = parseJsonArray(record[6]!, csvRowNumber, 'candles');
    if (candles.length !== candleCount) {
      throw new Error(
        `CSV row ${csvRowNumber} declares ${candleCount} candles but contains ${candles.length}.`,
      );
    }

    if (!candles.every(isNormalisedCandle)) {
      throw new Error(`CSV row ${csvRowNumber} contains an invalid candle.`);
    }

    const annotations = record[7];
    if (annotations) {
      parseJsonArray(annotations, csvRowNumber, 'annotations');
    }

    return serialiseCsvRecord(record);
  });

  return { rows };
}

function parseCsvRecords(source: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let atFieldStart = true;
  let inQuotes = false;
  let afterClosingQuote = false;

  const finishField = () => {
    record.push(field);
    field = '';
    atFieldStart = true;
    afterClosingQuote = false;
  };

  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (inQuotes) {
      if (character !== '"') {
        field += character;
        continue;
      }

      if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
        afterClosingQuote = true;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === ',') {
        finishField();
        continue;
      }

      if (character === '\n' || character === '\r') {
        finishRecord();
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        continue;
      }

      throw new Error(
        `The CSV has an unexpected character after a closing quote at character ${index + 1}.`,
      );
    }

    if (character === '"') {
      if (!atFieldStart) {
        throw new Error(
          `The CSV has an unexpected quote at character ${index + 1}.`,
        );
      }
      inQuotes = true;
      atFieldStart = false;
      continue;
    }

    if (character === ',') {
      finishField();
      continue;
    }

    if (character === '\n' || character === '\r') {
      finishRecord();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      continue;
    }

    field += character;
    atFieldStart = false;
  }

  if (inQuotes) {
    throw new Error('The CSV ends inside a quoted field.');
  }

  if (afterClosingQuote || !atFieldStart || record.length > 0) {
    finishRecord();
  }

  return records;
}

function serialiseCsvRecord(record: string[]): string {
  return record.map((field) => {
    if (!/[",\r\n]/.test(field)) return field;
    return `"${field.replaceAll('"', '""')}"`;
  }).join(',');
}

function parseJsonArray(
  value: string,
  csvRowNumber: number,
  column: string,
): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // The field-specific error below is more useful than JSON.parse's message.
  }

  throw new Error(
    `CSV row ${csvRowNumber} has invalid JSON in its ${column} column.`,
  );
}

function isNormalisedCandle(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const candle = value as Record<string, unknown>;
  return ['open', 'high', 'low', 'close'].every(
    (key) => typeof candle[key] === 'number' && Number.isFinite(candle[key]),
  );
}
