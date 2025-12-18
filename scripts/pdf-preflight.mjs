import fs from 'node:fs';

export function isLfsPointer(filePath) {
  try {
    const buf = fs.readFileSync(filePath, { encoding: 'utf8' });
    return buf.startsWith('version https://git-lfs.github.com/spec/v1');
  } catch {
    return false;
  }
}

export function hasPdfHeader(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(5);
      const bytes = fs.readSync(fd, header, 0, 5, 0);
      if (bytes < 5) return false;
      return header.toString('ascii') === '%PDF-';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export function isUsablePdf(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  return !isLfsPointer(filePath) && hasPdfHeader(filePath);
}
