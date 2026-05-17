import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import { checksumFile, createExecutableArchive } from "./release-archive.ts";

const readTarString = (buffer: Buffer, offset: number, length: number): string => {
  const field = buffer.subarray(offset, offset + length);
  const nullIndex = field.indexOf(0);
  return field.subarray(0, nullIndex === -1 ? field.length : nullIndex).toString("utf8");
};

const readTarOctal = (buffer: Buffer, offset: number, length: number): number => {
  const rawValue = readTarString(buffer, offset, length).trim();
  return Number.parseInt(rawValue, 8);
};

const makeTempDir = () => {
  const directory = join(tmpdir(), `kasb-release-archive-${crypto.randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  return directory;
};

describe("release archive creation", () => {
  test("creates a deterministic tar.gz containing the executable", () => {
    const directory = makeTempDir();
    const archivePath = join(directory, "kasb.tar.gz");
    const executable = Buffer.from("#!/bin/sh\necho kasb\n");

    createExecutableArchive({
      archivePath,
      archiveType: "tar.gz",
      executableName: "kasb",
      executable,
    });

    const gzip = readFileSync(archivePath);
    expect(gzip.readUInt32LE(4)).toBe(0);

    const tar = gunzipSync(gzip);
    expect(readTarString(tar, 0, 100)).toBe("kasb");
    expect(readTarOctal(tar, 100, 8)).toBe(0o755);
    expect(readTarOctal(tar, 124, 12)).toBe(executable.length);
    expect(tar.subarray(512, 512 + executable.length).equals(executable)).toBe(true);
  });

  test("creates a zip containing the Windows executable", () => {
    const directory = makeTempDir();
    const archivePath = join(directory, "kasb.zip");
    const executable = Buffer.from("MZ kasb executable");

    createExecutableArchive({
      archivePath,
      archiveType: "zip",
      executableName: "kasb.exe",
      executable,
    });

    const zip = readFileSync(archivePath);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(8)).toBe(8);
    expect(zip.readUInt16LE(10)).toBe(0);
    expect(zip.readUInt16LE(12)).toBe(33);

    const compressedSize = zip.readUInt32LE(18);
    const uncompressedSize = zip.readUInt32LE(22);
    const nameLength = zip.readUInt16LE(26);
    const fileName = zip.subarray(30, 30 + nameLength).toString("utf8");
    const compressedFile = zip.subarray(30 + nameLength, 30 + nameLength + compressedSize);

    expect(uncompressedSize).toBe(executable.length);
    expect(fileName).toBe("kasb.exe");
    expect(inflateRawSync(compressedFile).equals(executable)).toBe(true);

    const centralDirectoryOffset = 30 + nameLength + compressedSize;
    expect(zip.readUInt32LE(centralDirectoryOffset)).toBe(0x02014b50);
    expect(zip.readUInt32LE(centralDirectoryOffset + 42)).toBe(0);
  });

  test("checksums files with sha256", () => {
    const directory = makeTempDir();
    const archivePath = join(directory, "kasb.tar.gz");
    const executable = Buffer.from("kasb");

    createExecutableArchive({
      archivePath,
      archiveType: "tar.gz",
      executableName: "kasb",
      executable,
    });

    const expected = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    expect(checksumFile(archivePath)).toBe(expected);
  });
});
