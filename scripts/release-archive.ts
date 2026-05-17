import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync, gzipSync } from "node:zlib";

export type ReleaseArchiveType = "tar.gz" | "zip";

export type ExecutableArchiveInput = {
  readonly archivePath: string;
  readonly archiveType: ReleaseArchiveType;
  readonly executableName: string;
  readonly executable: Buffer;
};

const tarBlockSize = 512;
const zipDosDate = 33; // 1980-01-01, the earliest valid DOS date.
const zipDosTime = 0;

export const checksumFile = (path: string): string => {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
};

export const createExecutableArchive = (input: ExecutableArchiveInput) => {
  if (input.archiveType === "zip") {
    createZip(input.archivePath, input.executableName, input.executable);
    return;
  }

  createTarGz(input.archivePath, input.executableName, input.executable);
};

const writeTarString = (header: Buffer, value: string, offset: number, length: number) => {
  if (Buffer.byteLength(value) > length) {
    throw new Error(`Tar field is too long: ${value}`);
  }
  header.write(value, offset, length, "utf8");
};

const writeTarOctal = (header: Buffer, value: number, offset: number, length: number) => {
  const octal = value.toString(8).padStart(length - 1, "0");
  header.write(`${octal}\0`, offset, length, "ascii");
};

const createTarGz = (archivePath: string, fileName: string, file: Buffer) => {
  const header = Buffer.alloc(tarBlockSize);
  writeTarString(header, fileName, 0, 100);
  writeTarOctal(header, 0o755, 100, 8);
  writeTarOctal(header, 0, 108, 8);
  writeTarOctal(header, 0, 116, 8);
  writeTarOctal(header, file.length, 124, 12);
  writeTarOctal(header, 0, 136, 12);
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");

  const contentPadding = Buffer.alloc((tarBlockSize - (file.length % tarBlockSize)) % tarBlockSize);
  const tar = Buffer.concat([header, file, contentPadding, Buffer.alloc(tarBlockSize * 2)]);
  const archive = gzipSync(tar, { level: 9 });
  archive.writeUInt32LE(0, 4);
  writeFileSync(archivePath, archive);
};

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[index] = value >>> 0;
}

const crc32 = (buffer: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crc32Table[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const createZip = (archivePath: string, fileName: string, file: Buffer) => {
  const name = Buffer.from(fileName);
  const compressedFile = deflateRawSync(file, { level: 9 });
  const checksum = crc32(file);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(zipDosTime, 10);
  localHeader.writeUInt16LE(zipDosDate, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressedFile.length, 18);
  localHeader.writeUInt32LE(file.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localFile = Buffer.concat([localHeader, name, compressedFile]);

  const centralDirectory = Buffer.alloc(46);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(0, 8);
  centralDirectory.writeUInt16LE(8, 10);
  centralDirectory.writeUInt16LE(zipDosTime, 12);
  centralDirectory.writeUInt16LE(zipDosDate, 14);
  centralDirectory.writeUInt32LE(checksum, 16);
  centralDirectory.writeUInt32LE(compressedFile.length, 20);
  centralDirectory.writeUInt32LE(file.length, 24);
  centralDirectory.writeUInt16LE(name.length, 28);
  centralDirectory.writeUInt16LE(0, 30);
  centralDirectory.writeUInt16LE(0, 32);
  centralDirectory.writeUInt16LE(0, 34);
  centralDirectory.writeUInt16LE(0, 36);
  centralDirectory.writeUInt32LE(0, 38);
  centralDirectory.writeUInt32LE(0, 42);

  const centralFile = Buffer.concat([centralDirectory, name]);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralFile.length, 12);
  endOfCentralDirectory.writeUInt32LE(localFile.length, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  writeFileSync(archivePath, Buffer.concat([localFile, centralFile, endOfCentralDirectory]));
};
