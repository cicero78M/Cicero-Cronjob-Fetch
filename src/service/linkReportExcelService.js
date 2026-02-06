import fs from 'fs/promises';
import path from 'path';
import { generateLinkReportExcelBuffer } from './amplifyExportService.js';

export async function saveLinkReportExcel(rows, clientId, monthName) {
  const buffer = generateLinkReportExcelBuffer(rows);
  const exportDir = path.resolve('export_data');
  await fs.mkdir(exportDir, { recursive: true });
  const safeMonth = monthName.replace(/\s+/g, '_');
  const fileName = `${clientId}_${safeMonth}.xlsx`;
  const filePath = path.join(exportDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}
