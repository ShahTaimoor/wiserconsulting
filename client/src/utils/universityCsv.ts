/** The columns of the import sheet, in order. The first two are required. */
export const UNIVERSITY_COLUMNS = [
  "name",
  "country",
  "city",
  "website",
  "applyUrl",
  "fields",
  "minFscPercent",
  "minIelts",
  "minToefl",
  "minPte",
  "minDuolingo",
  "minOxford",
  "tuitionPerYear",
  "scholarshipAvailable",
  "scholarshipName",
  "scholarshipPercent",
  "scholarshipMinFscPercent",
  "scholarshipMinIelts",
  "scholarshipDetails",
  "scholarshipUrl",
  "applyDeadline",
  "applyDocuments",
  "applySteps",
  "notes",
] as const;

/** Splits CSV text into rows of cells. Handles quotes, commas and new lines inside quotes, and a leading byte-order mark. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  // Excel in some regions saves with ";" between the cells.
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
const KNOWN = new Map(UNIVERSITY_COLUMNS.map((column) => [normalise(column), column]));

/** Header row + data rows -> one object per university, using the known column names. Unknown columns are ignored. */
export function csvToUniversityRows(text: string): { rows: Record<string, string>[]; ignored: string[] } {
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], ignored: [] };
  const columns = header.map((name) => KNOWN.get(normalise(name)) || "");
  const ignored = header.filter((name, index) => name.trim() && !columns[index]);
  const rows = data.map((cells) => {
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      if (column) row[column] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { rows, ignored };
}

function escapeCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A sheet to fill in: the header and two example rows. */
export function universityTemplateCsv(): string {
  const examples = [
    ["Example University", "Canada", "Toronto", "https://example.edu", "https://example.edu/apply", "Engineering; Business", "75", "6.5", "90", "58", "115", "", "CAD 30,000", "yes", "Merit Scholarship", "25", "85", "7", "Awarded on FSc marks", "https://example.edu/scholarships", "1 March", "Passport; FSc transcript; IELTS result", "Create account; Upload documents; Pay fee", "Delete these example rows"],
    ["Second Example", "United Kingdom", "Leeds", "https://example.ac.uk", "", "", "70", "6.0", "", "", "", "", "", "no", "", "", "", "", "", "", "", "", "", ""],
  ];
  return [UNIVERSITY_COLUMNS.join(","), ...examples.map((row) => row.map(escapeCell).join(","))].join("\r\n") + "\r\n";
}
