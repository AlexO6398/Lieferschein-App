// lib/pdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "buffer";
import fs from "fs";
import path from "path";

/* =========================================================
   DELIVERY NOTE (bleibt wie gehabt)
========================================================= */

type BuildPdfArgs = {
  noteNumber: string;
  noteDate: string | null;
  customer: {
    name?: string | null;
    street?: string | null;
    zip?: string | null;
    city?: string | null;
    email?: string | null;
  } | null;
  workers: Array<{ name: string; hours: number | null }>;
  machines: Array<{ name: string; qty: number | null; unit: string | null }>;
  materials: Array<{ name: string; qty: number | null; unit: string | null }>;
  signatureDataUrl: string | null;
  photos?: string[];
  activitiesText?: string | null;
};

export async function buildDeliveryNotePdf(args: BuildPdfArgs) {
  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 50;

  const formatDateAT = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };

  const logoPath = path.join(process.cwd(), "public", "logo.png");
  let logo: any = null;
  try {
    const logoBytes = fs.readFileSync(logoPath);
    logo = await pdfDoc.embedPng(logoBytes);
  } catch {
    logo = null;
  }

  const hr = (page: any, yPos: number) => {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: PAGE_W - margin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const text = (
    page: any,
    t: string,
    x: number,
    y: number,
    size = 11,
    bold = false
  ) => {
    page.drawText(t ?? "", { x, y, size, font: bold ? fontBold : font });
  };

  const box = (page: any, x: number, y: number, w: number, h: number) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      color: rgb(1, 1, 1),
    });
  };

  const drawHeader = (page: any, yTop: number) => {
    if (logo) {
      const maxW = 120;
      const maxH = 50;
      const dims = logo.scale(1);
      const scale = Math.min(maxW / dims.width, maxH / dims.height);
      const w = dims.width * scale;
      const h = dims.height * scale;

      page.drawImage(logo, {
        x: margin + 35,
        y: yTop - h + 10,
        width: w,
        height: h,
      });
    }

    text(page, "GUGGS Gartenbau GmbH", margin + 140, yTop, 12, true);
    text(page, "Musterstraße 1", margin + 140, yTop - 14, 10);
    text(page, "6300 Musterstadt", margin + 140, yTop - 26, 10);
    text(page, "office@guggs.at", margin + 140, yTop - 38, 10);

    text(page, `Nr.: ${args.noteNumber}`, 400, yTop, 11, true);
    text(page, `Datum: ${formatDateAT(args.noteDate)}`, 400, yTop - 14, 10);

    const yAfter = yTop - 55;
    hr(page, yAfter);
    return yAfter - 20;
  };

  const drawFooter = (page: any) => {
    page.drawLine({
      start: { x: margin, y: 40 },
      end: { x: PAGE_W - margin, y: 40 },
      thickness: 0.5,
    });
    text(page, "GUGGS Gartenbau GmbH · UID ATUXXXXXXX", margin, 28, 9);
  };

  const page1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page1, 800);

  text(page1, "Kunde", margin, y, 12, true);
  y -= 14;

  const c = args.customer;
  const customerLines = [
    c?.name ?? "",
    c?.street ?? "",
    `${c?.zip ?? ""} ${c?.city ?? ""}`.trim(),
    c?.email ?? "",
  ].filter(Boolean);

  customerLines.forEach((l) => {
    text(page1, l, margin, y, 11);
    y -= 14;
  });

  y -= 8;
  hr(page1, y);
  y -= 18;

  const drawTable = (
    title: string,
    headers: string[],
    rows: string[][],
    colWidths: number[]
  ) => {
    text(page1, title, margin, y, 12, true);
    y -= 20;

    const startX = margin;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    const headerH = 18;
    const rowH = 18;

    page1.drawLine({
      start: { x: startX, y: y + headerH - 4 },
      end: { x: startX + tableWidth, y: y + headerH - 4 },
      thickness: 1,
    });

    page1.drawRectangle({
      x: startX,
      y: y - 4,
      width: tableWidth,
      height: headerH,
      color: rgb(0.95, 0.95, 0.95),
    });

    let x = startX;
    headers.forEach((h, i) => {
      text(page1, h, x + 6, y + 2, 10, true);
      x += colWidths[i];
    });

    page1.drawLine({
      start: { x: startX, y: y - 6 },
      end: { x: startX + tableWidth, y: y - 6 },
      thickness: 1,
    });

    const topY = y + headerH - 6;
    y -= headerH;

    rows.forEach((r, rowIdx) => {
      if (rowIdx % 2 === 0) {
        page1.drawRectangle({
          x: startX,
          y: y - 4,
          width: tableWidth,
          height: rowH,
          color: rgb(0.985, 0.985, 0.985),
        });
      }

      let rx = startX;
      r.forEach((cell, i) => {
        text(page1, String(cell ?? ""), rx + 6, y + 2, 10);
        rx += colWidths[i];
      });

      page1.drawLine({
        start: { x: startX, y: y - 6 },
        end: { x: startX + tableWidth, y: y - 6 },
        thickness: 0.5,
      });

      y -= rowH;
    });

    let vx = startX;
    const bottomY = y + rowH - 6;
    for (let i = 0; i < colWidths.length + 1; i++) {
      page1.drawLine({
        start: { x: vx, y: topY + 2 },
        end: { x: vx, y: bottomY },
        thickness: 0.5,
      });
      vx += colWidths[i] ?? 0;
    }

    y -= 18;
  };

  if (args.workers.length > 0) {
    drawTable(
      "Mitarbeiter",
      ["Name", "Stunden"],
      args.workers.map((w) => [w.name ?? "", `${w.hours ?? ""}`]),
      [380, 115]
    );
  }

  if (args.machines.length > 0) {
    drawTable(
      "Geräte",
      ["Bezeichnung", "Menge", "Einheit"],
      args.machines.map((m) => [
        m.name ?? "",
        `${m.qty ?? ""}`,
        `${m.unit ?? ""}`,
      ]),
      [300, 95, 100]
    );
  }

  if (args.materials.length > 0) {
    drawTable(
      "Material",
      ["Bezeichnung", "Menge", "Einheit"],
      args.materials.map((m) => [
        m.name ?? "",
        `${m.qty ?? ""}`,
        `${m.unit ?? ""}`,
      ]),
      [300, 95, 100]
    );
  }

  const activities = (args.activitiesText ?? "").trim();
  if (activities) {
    text(page1, "Tätigkeiten", margin, y, 12, true);
    y -= 16;

    const maxWidth = PAGE_W - margin * 2;
    const fontSize = 10;
    const lineHeight = 13;

    const wrapLine = (line: string) => {
      const words = line.split(/\s+/).filter(Boolean);
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        const width = font.widthOfTextAtSize(next, fontSize);
        if (width <= maxWidth) cur = next;
        else {
          if (cur) out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
      return out;
    };

    const lines = activities
      .split("\n")
      .flatMap((l) => (l.trim() ? wrapLine(l.trim()) : [""]))
      .slice(0, 12);

    lines.forEach((l) => {
      text(page1, l, margin, y, fontSize);
      y -= lineHeight;
    });

    y -= 8;
    hr(page1, y);
    y -= 18;
  }

  const sigBoxY = 80;
  text(page1, "Unterschrift Kunde", margin, sigBoxY + 120, 11, true);
  box(page1, margin, sigBoxY, 300, 110);

  if (args.signatureDataUrl) {
    const base64 = args.signatureDataUrl.split(",")[1];
    const img = Buffer.from(base64, "base64");
    const png = await pdfDoc.embedPng(img);

    const boxW = 300,
      boxH = 110,
      pad = 10;
    const maxW = boxW - pad * 2;
    const maxH = boxH - pad * 2;

    const pngDims = png.scale(1);
    const scale = Math.min(maxW / pngDims.width, maxH / pngDims.height);

    page1.drawImage(png, {
      x: margin + pad,
      y: sigBoxY + pad,
      width: pngDims.width * scale,
      height: pngDims.height * scale,
    });
  }

  drawFooter(page1);

  const photos = (args.photos ?? []).slice(0, 4);
  if (photos.length > 0) {
    const page2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y2 = drawHeader(page2, 800);

    text(page2, "Fotos", margin, y2, 16, true);
    y2 -= 20;
    hr(page2, y2);
    y2 -= 18;

    const gap = 12;
    const gridW = PAGE_W - margin * 2;
    const cellW = (gridW - gap) / 2;
    const cellH = 260;

    const startX = margin;
    const startY = y2;

    const positions = [
      { x: startX, y: startY - cellH },
      { x: startX + cellW + gap, y: startY - cellH },
      { x: startX, y: startY - (cellH * 2 + gap) },
      { x: startX + cellW + gap, y: startY - (cellH * 2 + gap) },
    ];

    const drawPhotoInCell = async (dataUrl: string, x: number, y: number) => {
      box(page2, x, y, cellW, cellH);

      const base64 = dataUrl.split(",")[1];
      const bytes = Buffer.from(base64, "base64");

      const isPng = dataUrl.startsWith("data:image/png");
      const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

      const pad = 10;
      const maxW = cellW - pad * 2;
      const maxH = cellH - pad * 2;

      const dims = img.scale(1);
      const scale = Math.min(maxW / dims.width, maxH / dims.height);

      const w = dims.width * scale;
      const h = dims.height * scale;

      const ix = x + (cellW - w) / 2;
      const iy = y + (cellH - h) / 2;

      page2.drawImage(img, { x: ix, y: iy, width: w, height: h });
    };

    for (let i = 0; i < photos.length; i++) {
      const pos = positions[i];
      await drawPhotoInCell(photos[i], pos.x, pos.y);
    }

    drawFooter(page2);
  }

  return await pdfDoc.save();
}

/* =========================================================
   OFFER PDF (inkl. Summen + MwSt + Linien + Spaltenbreite)
========================================================= */
// ===== ab HIER: Offer PDF (neu, komplett) =====

type OfferSectionRow = {
  qty: number;
  unit: string;
  article: string;
  articleText?: string | null;
  price: number;
};

type OfferSection = {
  number: string;
  title: string;
  descriptionHtml?: string;
  rows: OfferSectionRow[];
};

type BuildOfferArgs = {
  offerNumber: string;
  offerDate: string | null;
  customer: {
    name?: string | null;
    street?: string | null;
    zip?: string | null;
    city?: string | null;
  } | null;
  summary: string;
  salutation: string;
  sections: OfferSection[];
};

export async function buildOfferPdf(args: BuildOfferArgs) {
  const pdfDoc = await PDFDocument.create();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 50;

  const formatDateAT = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };

  // ✅ Tausenderpunkt + Komma + Euro
  const formatMoneyAT = (n: number) => {
    const v = Number(n ?? 0);
    return (
      v.toLocaleString("de-AT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " €"
    );
  };

  // -------- Logo laden --------
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  let logo: any = null;
  try {
    const logoBytes = fs.readFileSync(logoPath);
    logo = await pdfDoc.embedPng(logoBytes);
  } catch {
    logo = null;
  }

  const hr = (page: any, yPos: number) => {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: PAGE_W - margin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const text = (
    page: any,
    t: string,
    x: number,
    y: number,
    size = 11,
    bold = false
  ) => {
    page.drawText(t ?? "", { x, y, size, font: bold ? fontBold : font });
  };

  // rechtsbündig über Breite (für Summen sauber)
  const textRight = (
    page: any,
    t: string,
    rightX: number,
    y: number,
    size = 11,
    bold = false
  ) => {
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(t ?? "", size);
    page.drawText(t ?? "", { x: rightX - w, y, size, font: f });
  };

  const drawFooter = (page: any) => {
    page.drawLine({
      start: { x: margin, y: 40 },
      end: { x: PAGE_W - margin, y: 40 },
      thickness: 0.5,
    });
    text(page, "GUGGS Gartenbau GmbH · UID ATUXXXXXXX", margin, 28, 9);
  };

  const drawHeader = (page: any, yTop: number) => {
    if (logo) {
      const maxW = 120;
      const maxH = 50;
      const dims = logo.scale(1);
      const scale = Math.min(maxW / dims.width, maxH / dims.height);
      const w = dims.width * scale;
      const h = dims.height * scale;

      page.drawImage(logo, {
        x: margin + 35,
        y: yTop - h + 10,
        width: w,
        height: h,
      });
    }

    text(page, "GUGGS Gartenbau GmbH", margin + 140, yTop, 12, true);
    text(page, "Musterstraße 1", margin + 140, yTop - 14, 10);
    text(page, "6300 Musterstadt", margin + 140, yTop - 26, 10);
    text(page, "office@guggs.at", margin + 140, yTop - 38, 10);

    text(page, `Angebot: ${args.offerNumber}`, 340, yTop, 11, true);
    text(page, `Datum: ${formatDateAT(args.offerDate)}`, 340, yTop - 14, 10);
    text(page, `Sachbearbeiter: Reinhard Guggenberger`, 340, yTop - 28, 10);

    const yAfter = yTop - 55;
    hr(page, yAfter);
    return yAfter - 20;
  };

  // --------- very small HTML renderer: <strong>, <u>, <p>, <br>, <ul><li> ----------
  type Seg = { t: string; bold: boolean; underline: boolean };

  const htmlToSegments = (html: string): Seg[] => {
    let s = String(html ?? "");

    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/p>/gi, "\n");
    s = s.replace(/<p[^>]*>/gi, "");

    s = s.replace(/<\/li>/gi, "\n");
    s = s.replace(/<li[^>]*>/gi, "• ");
    s = s.replace(/<\/?ul[^>]*>/gi, "");
    s = s.replace(/<\/?ol[^>]*>/gi, "");

    const segs: Seg[] = [];
    let bold = false;
    let underline = false;

    const parts = s.split(/(<\/?strong>|<\/?b>|<\/?u>)/gi);

    for (const p of parts) {
      const low = p.toLowerCase();
      if (low === "<strong>" || low === "<b>") {
        bold = true;
        continue;
      }
      if (low === "</strong>" || low === "</b>") {
        bold = false;
        continue;
      }
      if (low === "<u>") {
        underline = true;
        continue;
      }
      if (low === "</u>") {
        underline = false;
        continue;
      }
      const clean = p.replace(/<\/?[^>]+>/g, "");
      if (clean) segs.push({ t: clean, bold, underline });
    }

    return segs;
  };

  const drawSegmentsWrapped = (
    page: any,
    segs: Seg[],
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    lineHeight: number
  ) => {
    let cx = x;
    let cy = y;

    const spaceW = font.widthOfTextAtSize(" ", fontSize);

    const newline = () => {
      cx = x;
      cy -= lineHeight;
    };

    for (const seg of segs) {
      const chunks = seg.t.split("\n");
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const words = chunk.split(/\s+/).filter((w) => w.length > 0);

        for (const w of words) {
          const f = seg.bold ? fontBold : font;
          const wW = f.widthOfTextAtSize(w, fontSize);

          // ✅ kein führendes Leerzeichen am Zeilenanfang
          if (cx !== x) {
            if (cx + spaceW + wW > x + maxWidth) newline();
            else cx += spaceW;
          } else {
            if (cx + wW > x + maxWidth) newline();
          }

          page.drawText(w, { x: cx, y: cy, size: fontSize, font: f });

          if (seg.underline) {
            page.drawLine({
              start: { x: cx, y: cy - 1 },
              end: { x: cx + wW, y: cy - 1 },
              thickness: 0.6,
              color: rgb(0, 0, 0),
            });
          }

          cx += wW;
        }

        if (ci < chunks.length - 1) newline();
      }
    }

    return { y: cy };
  };

  // ---------- pagination helper ----------
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page, 800);

  const newPage = () => {
    drawFooter(page);
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = drawHeader(page, 800);
  };

  const ensureSpace = (need: number) => {
    if (y - need < 70) newPage();
  };

  // ---------- text wrap helper ----------
  const wrapText = (t: string, maxWidth: number, fontSize: number) => {
    const words = t.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";

    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      const width = font.widthOfTextAtSize(next, fontSize);
      if (width <= maxWidth) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const measureDescHeight = (html: string, maxWidth: number) => {
    const segs = htmlToSegments(html);
    const plain = segs.map((s) => s.t).join("");
    const lines = plain
      .split("\n")
      .flatMap((l) => (l.trim() ? wrapText(l.trim(), maxWidth, 10) : [""]));
    const lineH = 13;
    return lines.length * lineH + 10;
  };

  // =================== Customer block ===================
  const c = args.customer;

  ensureSpace(80);
  const custLines = [
    c?.name ?? "",
    c?.street ?? "",
    `${c?.zip ?? ""} ${c?.city ?? ""}`.trim(),
  ].filter(Boolean);

  custLines.forEach((l, idx) => {
    text(page, l, margin, y, idx === 0 ? 11 : 10, idx === 0);
    y -= 14;
  });

  y -= 10;
  hr(page, y);
  y -= 18;

  // =================== Subject / salutation / fixed sentence ===================
  ensureSpace(60);
  if (args.summary?.trim()) {
    text(page, args.summary.trim(), margin, y, 13, true);
    y -= 22;
  }

  if (args.salutation?.trim()) {
    text(page, args.salutation.trim(), margin, y, 11);
    y -= 18;
  }

  text(
    page,
    "Wir danken Ihnen für Ihre Nachfrage und bieten Ihnen nachstehend freibleibend wie folgt an:",
    margin,
    y,
    11
  );
  y -= 26;

  // =================== Sections sorting ===================
  const parseNo = (n: string) => n.split(".").map((x) => parseInt(x || "0", 10));
  const sorted = [...(args.sections ?? [])].sort((a, b) => {
    const pa = parseNo(a.number || "0.0.0");
    const pb = parseNo(b.number || "0.0.0");
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
  });

  // =================== table geometry ===================
  const tableLeft = margin;
  const tableRight = PAGE_W - margin;

  // ✅ Menge schmäler / Gesamtpreis dicker
  const colW = {
    qty: 40,
    unit: 55,
    price: 85,
    total: 110,
  };

  const colX = {
    qty: tableLeft,
    unit: tableLeft + colW.qty,
    article: tableLeft + colW.qty + colW.unit,
    price: tableRight - (colW.price + colW.total),
    total: tableRight - colW.total,
  };
  


  
  const PAD_R = 6;
const priceRightX = colX.total - PAD_R;  // rechter Rand der Einzelpreis-Spalte
const totalRightX = tableRight - PAD_R;  // rechter Rand der Gesamtpreis-Spalte



  const drawTableHeader = () => {
    page.drawRectangle({
      x: tableLeft,
      y: y - 7,
      width: tableRight - tableLeft,
      height: 18,
      color: rgb(0.95, 0.95, 0.95),
    });

    text(page, "Menge", colX.qty, y, 10, true);
    text(page, "Einheit", colX.unit, y, 10, true);
    text(page, "Artikel", colX.article, y, 10, true);
textRight(page, "Einzelpreis", priceRightX, y, 10, true);
textRight(page, "Gesamtpreis", totalRightX, y, 10, true);


    const lineY = y - 6;
    page.drawLine({
      start: { x: tableLeft, y: lineY },
      end: { x: tableRight, y: lineY },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    y -= 18;
  };

  // ✅ Linien zwischen jeder Zeile – NICHT zu weit unten
  // wir zeichnen sie bei currentY - 4 (nahe unter der Zeile)
  
  const drawRowSeparatorAt = (yRow: number) => {
    page.drawLine({
      start: { x: tableLeft, y: yRow - 4 },
      end: { x: tableRight, y: yRow - 4 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
  };

  // =================== totals accumulation (netto) ===================
  let offerNetSum = 0;

  for (const sec of sorted) {
    // ✅ Kein Umbruch zwischen Tabellenkopf + mind. 1 Positionszeile + Summeblock
    // Minimalblock: Head + Desc + TableHeader + oneRow + Summe(2 Zeilen) + Luft
    const headH = 18;
    const afterHeadGap = 6;
    const tableHeaderH = 24;
    const minRowH = 16;
    const sumBlockH = 30; // "Summe:" Zeile + Abstand/Line
    const descH = sec.descriptionHtml
      ? measureDescHeight(String(sec.descriptionHtml), PAGE_W - margin * 2)
      : 0;

    const minBlock = headH + afterHeadGap + descH + tableHeaderH + minRowH + sumBlockH + 10;
    ensureSpace(minBlock);

    // Headline
    const head = `${sec.number ?? ""} ${sec.title ?? ""}`.trim();
    text(page, head, margin, y, 12, true);
    y -= 18;

    // Description
    const desc = String(sec.descriptionHtml ?? "").trim();
    if (desc) {
      ensureSpace(50);
      const segs = htmlToSegments(desc);
      const res = drawSegmentsWrapped(page, segs, margin, y, PAGE_W - margin * 2, 10, 13);
      y = res.y - 10;
    }

	const rows = Array.isArray(sec.rows) ? sec.rows : [];

// ✅ Wenn keine Rows: keine Tabelle zeichnen
if (rows.length === 0) {
 

  // und weiter zur nächsten Section
  continue;
}

    ensureSpace(50);
    drawTableHeader();


    let sectionSum = 0;

    if (rows.length === 0) {
      text(page, "— keine Positionen —", margin, y, 10);
      drawRowSeparatorAt(y);
      y -= 16;
    } else {
for (let idx = 0; idx < rows.length; idx++) {
  const r = rows[idx];

  // wenn eine Standardzeile nicht passt: neue Seite + header
  if (y - 18 < 70) {
    newPage();
    drawTableHeader();
  }

  const rowY = y; // merken für Separator
  const qty = Number(r.qty ?? 0);
  const price = Number(r.price ?? 0);
  const total = qty * price;

  sectionSum += total;
  offerNetSum += total;

  // Hauptzeile
  text(page, qty ? String(qty) : "", colX.qty, y, 10);
  text(page, String(r.unit ?? ""), colX.unit, y, 10);
  text(page, String(r.article ?? ""), colX.article, y, 10);

  // ✅ Werte rechtsbündig innerhalb der Spalten (schaut sauber aus)
  textRight(page, price ? formatMoneyAT(price) : "", priceRightX, y, 10);
  textRight(page, total ? formatMoneyAT(total) : "", totalRightX, y, 10);

  // Artikeltext darunter (wrap bis VOR Preis-Spalte)
  const articleText = String((r as any).articleText ?? "").trim();
  let extraHeight = 0;

  if (articleText) {
    const fontSize = 9;
    const lineH = 11;
    const maxTextW = (colX.price - 8) - colX.article;

    const lines = articleText
      .split("\n")
      .map((l) => l.replace(/^\s+/, "")) // ✅ kein führendes Leerzeichen
      .flatMap((l) => (l.trim() ? wrapText(l.trim(), maxTextW, fontSize) : [""]))
      .slice(0, 12);

    let yy = y - 12;
    for (const line of lines) {
      if (yy < 70) {
        newPage();
        drawTableHeader();
        yy = y - 12;
      }
      text(page, line, colX.article, yy, fontSize);
      yy -= lineH;
      extraHeight += lineH;
    }
  }

  // ✅ Separator NUR wenn nicht die letzte Zeile
  const isLast = idx === rows.length - 1;
  if (!isLast) {
    drawRowSeparatorAt(rowY - (extraHeight > 0 ? extraHeight : 0));
  }

  // y vorziehen
  y -= 16 + extraHeight;
}


      // ✅ Summeblock soll nie alleine auf nächste Seite rutschen:
      if (y - 30 < 70) {
        newPage();
        drawTableHeader();
      }

      // Linie über Summe
      page.drawLine({
        start: { x: tableLeft, y: y + 8 },
        end: { x: tableRight, y: y + 8 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      // "Summe" rechts (sauber, ohne Überschreiben)
      textRight(page, "Summe:", priceRightX, y - 10, 10, true);
textRight(page, formatMoneyAT(sectionSum), totalRightX, y - 10, 10, true);


      y -= 28;
    }

    y -= 14;
  }

  // =================== Offer totals block ===================
  const vat = offerNetSum * 0.2;
  const gross = offerNetSum + vat;

  // ✅ genug Platz (und nicht in Footer laufen)
  if (y - 140 < 70) newPage();

  // Trennlinie
  page.drawLine({
    start: { x: tableLeft, y: y + 10 },
    end: { x: tableRight, y: y + 10 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // ✅ Labels links, Werte rechtsbündig ganz rechts -> kein Überschreiben mehr
  text(page, "Angebotssumme (netto)", colX.price, y - 10, 11, true);
  textRight(page, formatMoneyAT(offerNetSum), tableRight, y - 10, 11, true);

  text(page, "MwSt (20%)", colX.price, y - 28, 11, true);
  textRight(page, formatMoneyAT(vat), tableRight, y - 28, 11, true);

  page.drawLine({
    start: { x: colX.price, y: y - 38 },
    end: { x: tableRight, y: y - 38 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  text(page, "Angebotssumme", colX.price, y - 54, 12, true);
  textRight(page, formatMoneyAT(gross), tableRight, y - 54, 12, true);

  y -= 85;

  // =================== Closing text block (wie gewünscht) ===================
  const closingLines = [
    { t: "Dieses Angebot ist kein Fixangebot, alles wird nach tatsächlichem Aufwand abgerechnet!", bold: true },
    { t: "", bold: false },
    { t: "", bold: false },
    {
      t: "Wir hoffen mit diesem Angebot gedient zu haben und würden uns über Ihren Auftrag sehr freuen. Für weitere Fragen und Auskünfte stehen wir Ihnen jederzeit gerne zur Verfügung und verbleiben",
      bold: false,
    },
    { t: "", bold: false },
    { t: "mit freundlichen Grüßen", bold: false },
    { t: "", bold: false },
    { t: "Guggenberger Hardy", bold: false },
    { t: "Gugg's Gartenbau", bold: false },
  ];

  // Wrap für den langen Absatz
  const maxW = PAGE_W - margin * 2;
  const paraFont = 10;
  const lineH = 13;

  const drawWrappedParagraph = (t: string, bold = false) => {
    const lines = wrapText(t, maxW, paraFont);
    for (const l of lines) {
      if (y - lineH < 70) newPage();
      text(page, l, margin, y, paraFont, bold);
      y -= lineH;
    }
  };

  for (const line of closingLines) {
    if (line.t === "") {
      y -= lineH; // Leerzeile
      continue;
    }
    if (line.t.length > 110) {
      drawWrappedParagraph(line.t, line.bold);
    } else {
      if (y - lineH < 70) newPage();
      text(page, line.t, margin, y, paraFont, line.bold);
      y -= lineH;
    }
  }

  drawFooter(page);
  return await pdfDoc.save();
}
