import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { and, asc, eq, ilike, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { cleanEmailsField } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs Node APIs
export const maxDuration = 60;

// Columns mirror reference/app.py's export (header label, row key, width).
const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "Company", key: "company", width: 32 },
  { header: "Segment", key: "segment", width: 26 },
  { header: "Country", key: "country", width: 14 },
  { header: "City", key: "city", width: 13 },
  { header: "Category", key: "category", width: 20 },
  { header: "Address", key: "address", width: 42 },
  { header: "Phone", key: "phone", width: 20 },
  { header: "Website", key: "website", width: 32 },
  { header: "Emails", key: "emails", width: 32 },
  { header: "Status", key: "status", width: 12 },
  { header: "Notes", key: "notes", width: 30 },
  { header: "Maps URL", key: "googleMapsUrl", width: 30 },
];

/**
 * GET /api/export — streams an .xlsx. With no query params it exports all
 * prospects; with country/segment/status/q it exports the filtered view (same
 * filters as /api/prospects).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const segment = searchParams.get("segment");
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const website = searchParams.get("website");
  const q = searchParams.get("q");

  const conditions = [];
  if (country && country !== "All") conditions.push(eq(prospects.country, country));
  if (segment && segment !== "All") conditions.push(like(prospects.segment, `%${segment}%`));
  if (category && category !== "All") conditions.push(eq(prospects.category, category));
  if (status && status !== "All") conditions.push(eq(prospects.status, status));
  if (website === "Has site") conditions.push(sql`coalesce(${prospects.website}, '') <> ''`);
  else if (website === "No site") conditions.push(sql`coalesce(${prospects.website}, '') = ''`);
  if (q) conditions.push(or(ilike(prospects.company, `%${q}%`), ilike(prospects.city, `%${q}%`)));

  const db = getDb();
  const rows = await db
    .select()
    .from(prospects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(prospects.country), asc(prospects.city), asc(prospects.company));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prospects");
  ws.columns = COLUMNS;

  // Header row: Dimak orange fill, bold white text.
  const header = ws.getRow(1);
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B00" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle" };
  });

  for (const r of rows) {
    ws.addRow({
      company: r.company,
      segment: r.segment,
      country: r.country,
      city: r.city,
      category: r.category,
      address: r.address,
      phone: r.phone,
      website: r.website,
      emails: cleanEmailsField(r.emails),
      status: r.status,
      notes: r.notes,
      googleMapsUrl: r.googleMapsUrl,
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }]; // freeze header row
  const lastCol = ws.getColumn(COLUMNS.length).letter;
  ws.autoFilter = { from: "A1", to: `${lastCol}${rows.length + 1}` };

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dimak_prospects_${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
