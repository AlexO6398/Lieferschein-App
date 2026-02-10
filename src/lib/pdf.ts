import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";


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
};

export async function buildDeliveryNotePdf(args: BuildPdfArgs) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 800;

  const formatDateAT = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };

  const text = (t: string, x: number, y: number, size = 11, bold = false) => {
    page.drawText(t ?? "", { x, y, size, font: bold ? fontBold : font });
  };

  const hr = (yPos: number) => {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: 595.28 - margin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const box = (x: number, y: number, w: number, h: number) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      color: rgb(1, 1, 1), // weiß
    });
  };

// --- Logo laden & proportional skalieren ---
const logoPath = path.join(process.cwd(), "public", "logo.png");
let logo: any = null;

try {
  const logoBytes = fs.readFileSync(logoPath);
  logo = await pdfDoc.embedPng(logoBytes);
} catch {
  logo = null;
}

if (logo) {
  const maxW = 120; // maximale Breite im Header
  const maxH = 50;  // maximale Höhe im Header

  const dims = logo.scale(1);
  const scale = Math.min(
    maxW / dims.width,
    maxH / dims.height
  );

  const w = dims.width * scale;
  const h = dims.height * scale;

const logoX = margin + 35; // -> nach rechts schieben (mehr = weiter rechts)
const logoTopY = y;        // y ist bei dir die obere Header-Linie

page.drawImage(logo, {
  x: logoX,
  y: logoTopY - h +10,   // h wird abgezogen, damit "oben" bündig bleibt
  width: w,
  height: h,
});

}


  text("GUGGS Gartenbau GmbH", margin + 140, y, 12, true);
  text("Musterstraße 1", margin + 140, y - 14, 10);
  text("6300 Musterstadt", margin + 140, y - 26, 10);
  text("office@guggs.at", margin + 140, y - 38, 10);

  text(`Nr.: ${args.noteNumber}`, 400, y, 11, true);
  text(`Datum: ${formatDateAT(args.noteDate)}`, 400, y - 14, 10);

  y -= 55;
  hr(y);
  y -= 20;

  // --- KUNDE ---
  text("Kunde", margin, y, 12, true);
  y -= 14;

  const c = args.customer;
  const customerLines = [
    c?.name ?? "",
    c?.street ?? "",
    `${c?.zip ?? ""} ${c?.city ?? ""}`.trim(),
    c?.email ?? "",
  ].filter(Boolean);

  customerLines.forEach((l) => {
    text(l, margin, y, 11);
    y -= 14;
  });

  y -= 8;
  hr(y);
  y -= 18;

  // --- TABLE HELPER (alles IN der Funktion) ---
  const drawTable = (
    title: string,
    headers: string[],
    rows: string[][],
    colWidths: number[]
  ) => {
    text(title, margin, y, 12, true);
    y -= 20;

    const startX = margin;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    const headerH = 18;
    const rowH = 18;

	// TOP border des Tabellen-Headers (fehlt aktuell)
page.drawLine({
  start: { x: startX, y: y + headerH - 4 },
  end: { x: startX + tableWidth, y: y + headerH - 4 },
  thickness: 1,
});


    // Header Hintergrund
    page.drawRectangle({
      x: startX,
      y: y - 4,
      width: tableWidth,
      height: headerH,
      color: rgb(0.95, 0.95, 0.95),
    });

    // Header Text
    let x = startX;
    headers.forEach((h, i) => {
      text(h, x + 6, y + 2, 10, true);
      x += colWidths[i];
    });

    // Header Linie
    page.drawLine({
      start: { x: startX, y: y - 6 },
      end: { x: startX + tableWidth, y: y - 6 },
      thickness: 1,
    });

    const topY = y + headerH - 6;
    y -= headerH;

    rows.forEach((r, rowIdx) => {
      // Zebra
      if (rowIdx % 2 === 0) {
        page.drawRectangle({
          x: startX,
          y: y - 4,
          width: tableWidth,
          height: rowH,
          color: rgb(0.985, 0.985, 0.985),
        });
      }

      let rx = startX;
      r.forEach((cell, i) => {
        text(String(cell ?? ""), rx + 6, y + 2, 10);
        rx += colWidths[i];
      });

      // Row Linie
      page.drawLine({
        start: { x: startX, y: y - 6 },
        end: { x: startX + tableWidth, y: y - 6 },
        thickness: 0.5,
      });

      y -= rowH;
    });

    // Vertikale Linien
    let vx = startX;
    const bottomY = y + rowH - 6;
    for (let i = 0; i < colWidths.length + 1; i++) {
      page.drawLine({
        start: { x: vx, y: topY +2 },
        end: { x: vx, y: bottomY },
        thickness: 0.5,
      });
      vx += colWidths[i] ?? 0;
    }

    y -= 18;
  };

  // ✅ Tabellen nur wenn Inhalt da
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
      args.machines.map((m) => [m.name ?? "", `${m.qty ?? ""}`, `${m.unit ?? ""}`]),
      [300, 95, 100]
    );
  }

  if (args.materials.length > 0) {
    drawTable(
      "Material",
      ["Bezeichnung", "Menge", "Einheit"],
      args.materials.map((m) => [m.name ?? "", `${m.qty ?? ""}`, `${m.unit ?? ""}`]),
      [300, 95, 100]
    );
  }

  // --- SIGNATURE ---
  const sigBoxY = 80;
  text("Unterschrift Kunde", margin, sigBoxY + 120, 11, true);
  box(margin, sigBoxY, 300, 110);

  if (args.signatureDataUrl) {
    const base64 = args.signatureDataUrl.split(",")[1];
    const img = Buffer.from(base64, "base64");
    const png = await pdfDoc.embedPng(img);

    const boxW = 300, boxH = 110, pad = 10;
    const maxW = boxW - pad * 2;
    const maxH = boxH - pad * 2;

    const pngDims = png.scale(1);
    const scale = Math.min(maxW / pngDims.width, maxH / pngDims.height);

    page.drawImage(png, {
      x: margin + pad,
      y: sigBoxY + pad,
      width: pngDims.width * scale,
      height: pngDims.height * scale,
    });
  }

  // Footer
  page.drawLine({
    start: { x: margin, y: 40 },
    end: { x: 595.28 - margin, y: 40 },
    thickness: 0.5,
  });
  text("GUGGS Gartenbau GmbH · UID ATUXXXXXXX", margin, 28, 9);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
