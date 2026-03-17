import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Nettostunden -> Endzeit als Excel-Bruchteil
// Beginn 07:00, Ende = 07:00 + Nettostunden + 1h Pause
function calcEndExcelTime(netHours: number): number {
  const totalMinutes = 7 * 60 + Math.round(netHours * 60) + 60;
  return totalMinutes / (24 * 60);
}

const thinBorder: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
};
const headerFill: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" },
};
const sumFill: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" },
};

export async function POST(req: NextRequest) {
  try {
    const { dateFrom, dateTo, customerId } = await req.json();

    if (!dateFrom || !dateTo) {
      return Response.json({ error: "dateFrom und dateTo erforderlich" }, { status: 400 });
    }

    const toDate = new Date(dateTo);
    const year = toDate.getFullYear();
    const month = toDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthNames = [
      "Jänner", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember",
    ];
    const monthLabel = `${monthNames[month]} ${year}`;

    const toNext = new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    let q = supabase
      .from("delivery_worker_entries")
      .select("hours, delivery_notes(note_date, status, customer_id), workers(name)")
      .in("delivery_notes.status", ["final", "archive"])
      .gte("delivery_notes.note_date", dateFrom)
      .lt("delivery_notes.note_date", toNext)
      .order("created_at", { ascending: true });

    if (customerId) {
      q = q.eq("delivery_notes.customer_id", customerId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const entries = (data ?? []) as any[];

    const map = new Map<string, Map<string, number>>();
    for (const e of entries) {
      const noteDate = e.delivery_notes?.note_date;
      const status = e.delivery_notes?.status;
      if (!noteDate || (status !== "final" && status !== "archive")) continue;
      const dateYmd = noteDate.slice(0, 10);
      const name = String(e.workers?.name ?? "").trim();
      if (!name) continue;
      const hours = Number(e.hours ?? 0) || 0;
      if (!map.has(name)) map.set(name, new Map());
      const perDay = map.get(name)!;
      perDay.set(dateYmd, (perDay.get(dateYmd) ?? 0) + hours);
    }

    if (map.size === 0) {
      return Response.json({ error: "Keine Daten im gewählten Zeitraum" }, { status: 404 });
    }

    const wb = new ExcelJS.Workbook();
    const employees = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "de"));

    for (const empName of employees) {
      const perDay = map.get(empName)!;
      const sheetName = empName.replace(/[\\\/\*\?\[\]:]/g, "").slice(0, 31);
      const ws = wb.addWorksheet(sheetName);

      ws.getColumn("A").width = 6;
      ws.getColumn("B").width = 8;
      ws.getColumn("C").width = 42;
      ws.getColumn("D").width = 14;
      ws.getColumn("E").width = 14;
      ws.getColumn("F").width = 10;
      ws.getColumn("G").width = 14;
      ws.getColumn("H").width = 12;
      ws.getColumn("I").width = 10;
      ws.getColumn("J").width = 10;

      // Zeile 2: Titel
      ws.mergeCells("A2:J2");
      const titleCell = ws.getCell("A2");
      titleCell.value = "Arbeitszeit- Reisespesenaufzeichnung";
      titleCell.font = { bold: true, size: 13, name: "Arial", color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(2).height = 22;

      // Zeile 3: Dienstnehmer
      ws.getCell("A3").value = "Dienstnehmer:";
      ws.getCell("A3").font = { bold: true, name: "Arial" };
      ws.mergeCells("A4:E4");
      ws.getCell("A4").value = empName;
      ws.getCell("A4").font = { bold: true, size: 12, name: "Arial" };
      ws.getCell("A4").border = { bottom: thinBorder };

      // Zeile 4: Monat
      ws.getCell("G4").value = "Monat:";
      ws.getCell("G4").font = { bold: true, name: "Arial" };
      ws.mergeCells("H4:J4");
      ws.getCell("H4").value = monthLabel;
      ws.getCell("H4").font = { bold: true, size: 12, name: "Arial" };
      ws.getCell("H4").border = { bottom: thinBorder };

      // Zeile 5: Normalpause
      ws.getCell("C5").value = "Normalpause";
      ws.getCell("C5").font = { name: "Arial" };
      ws.getCell("G5").value = 1 / 24;
      ws.getCell("G5").numFmt = "h:mm";
      ws.getCell("G5").border = allBorders;

      // Zeile 6: Freistellungen Header
      ws.mergeCells("H6:J6");
      ws.getCell("H6").value = "Freistellungen";
      ws.getCell("H6").font = { bold: true, name: "Arial" };
      ws.getCell("H6").alignment = { horizontal: "center" };
      ws.getCell("H6").fill = headerFill;
      ws.getCell("H6").border = allBorders;

      // Zeile 7: Spaltenheader
      const headerDefs: [string, string][] = [
        ["A7", "D."], ["B7", "PLZ"],
        ["C7", "Anmerkung / Arbeitsbeschreibung"],
        ["D7", "Arbeits-\nbeginn"], ["E7", "Arbeits-\nende"],
        ["F7", "Pause"], ["G7", "Arbeits-\nstunden"],
        ["H7", "Urlaub"], ["I7", "Krank"], ["J7", "Feier-\ntag"],
      ];
      ws.getRow(7).height = 32;
      for (const [cell, val] of headerDefs) {
        const c = ws.getCell(cell);
        c.value = val;
        c.font = { bold: true, name: "Arial", size: 10 };
        c.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
        c.fill = headerFill;
        c.border = allBorders;
      }

      // Tageszeilen
      const mm = String(month + 1).padStart(2, "0");
      for (let day = 1; day <= daysInMonth; day++) {
        const rowIdx = 7 + day;
        const dd = String(day).padStart(2, "0");
        const dateYmd = `${year}-${mm}-${dd}`;
        const netHours = perDay.get(dateYmd) ?? 0;
        const dayOfWeek = new Date(year, month, day).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const weekendFill: ExcelJS.Fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" },
        };

        const row = ws.getRow(rowIdx);
        row.height = 16;

        for (let c = 1; c <= 10; c++) {
          const cell = row.getCell(c);
          cell.border = allBorders;
          cell.font = { name: "Arial", size: 10 };
          if (isWeekend) cell.fill = weekendFill;
        }

        row.getCell(1).value = `${day}.`;
        row.getCell(1).alignment = { horizontal: "center" };

        if (netHours > 0) {
          // Beginn: 07:00
          row.getCell(4).value = 7 / 24;
          row.getCell(4).numFmt = "h:mm";
          row.getCell(4).alignment = { horizontal: "center" };

          // Ende: 07:00 + Nettostunden + 1h Pause
          row.getCell(5).value = calcEndExcelTime(netHours);
          row.getCell(5).numFmt = "h:mm";
          row.getCell(5).alignment = { horizontal: "center" };
        }

        // Pause (0 wenn kein Ende)
        row.getCell(6).value = { formula: `IF(ISBLANK(E${rowIdx}),0,$G$5)` };
        row.getCell(6).numFmt = "h:mm";
        row.getCell(6).alignment = { horizontal: "center" };

        // Arbeitsstunden = Ende - Beginn - Pause = Nettostunden
        row.getCell(7).value = { formula: `IF(ISBLANK(E${rowIdx}),"",E${rowIdx}-D${rowIdx}-F${rowIdx})` };
        row.getCell(7).numFmt = "h:mm";
        row.getCell(7).alignment = { horizontal: "center" };
      }

      // Summenzeile
      const sumRow = 8 + daysInMonth;
      ws.getRow(sumRow).height = 18;
      for (let c = 1; c <= 10; c++) {
        const cell = ws.getCell(sumRow, c);
        cell.border = allBorders;
        cell.fill = sumFill;
        cell.font = { bold: true, name: "Arial", size: 10 };
      }
      ws.getCell(`C${sumRow}`).value = "Summe";
      for (const col of ["G", "H", "I", "J"]) {
        ws.getCell(`${col}${sumRow}`).value = { formula: `SUM(${col}8:${col}${sumRow - 1})` };
        ws.getCell(`${col}${sumRow}`).numFmt = "[h]:mm";
        ws.getCell(`${col}${sumRow}`).alignment = { horizontal: "center" };
      }

      // Summe Gesamt
      const totalRow = sumRow + 1;
      ws.getRow(totalRow).height = 18;
      for (let c = 1; c <= 10; c++) {
        const cell = ws.getCell(totalRow, c);
        cell.border = allBorders;
        cell.fill = sumFill;
        cell.font = { bold: true, name: "Arial", size: 10 };
      }
      ws.getCell(`C${totalRow}`).value = "Summe Gesamt An- und Abwesenheit";
      ws.getCell(`H${totalRow}`).value = { formula: `G${sumRow}+H${sumRow}+I${sumRow}+J${sumRow}` };
      ws.getCell(`H${totalRow}`).numFmt = "[h]:mm";
      ws.getCell(`H${totalRow}`).alignment = { horizontal: "center" };
    }

    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="zeitaufzeichnung_${dateFrom}_bis_${dateTo}.xlsx"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? "Export Fehler" }, { status: 500 });
  }
}