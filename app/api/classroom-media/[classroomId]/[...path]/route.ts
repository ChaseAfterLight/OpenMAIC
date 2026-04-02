import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { CLASSROOMS_DIR, isValidClassroomId } from '@/lib/server/classroom-storage';
import {
  getAudioFileBlob,
  getMediaFileBlob,
  listAudioFileRecordsByStageId,
  listMediaFilesByStageId,
} from '@/lib/server/storage-repository';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomMedia');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

function matchesStoredRecordId(recordId: string, classroomId: string, stem: string): boolean {
  return recordId === stem || recordId === `${classroomId}:${stem}` || recordId.endsWith(`:${stem}`);
}

async function tryServeStoredMedia(classroomId: string, stem: string) {
  const exact = await getMediaFileBlob(classroomId, stem);
  if (exact) {
    return exact;
  }
  const records = await listMediaFilesByStageId(classroomId);
  const record = records.find((item) => matchesStoredRecordId(item.id, classroomId, stem));
  if (!record) {
    return null;
  }
  return getMediaFileBlob(classroomId, record.id);
}

async function tryServeStoredAudio(classroomId: string, stem: string) {
  const exact = await getAudioFileBlob(classroomId, stem);
  if (exact) {
    return exact;
  }
  const records = await listAudioFileRecordsByStageId(classroomId);
  const record = records.find((item) => matchesStoredRecordId(item.id, classroomId, stem));
  if (!record) {
    return null;
  }
  return getAudioFileBlob(classroomId, record.id);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Only allow media/ and audio/ subdirectories
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 404 });
  }

  const filename = pathSegments[pathSegments.length - 1];
  const stem = path.parse(filename).name;

  try {
    const stored =
      subDir === 'media'
        ? await tryServeStoredMedia(classroomId, stem)
        : await tryServeStoredAudio(classroomId, stem);
    if (stored) {
      return new NextResponse(new Uint8Array(stored.buffer), {
        status: 200,
        headers: {
          'Content-Type': stored.mimeType,
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }
  } catch (error) {
    log.warn(
      `Stored classroom ${subDir} lookup failed [classroomId=${classroomId}, path=${joined}]:`,
      error,
    );
  }

  const filePath = path.join(CLASSROOMS_DIR, classroomId, ...pathSegments);
  const resolvedBase = path.resolve(CLASSROOMS_DIR, classroomId);

  try {
    // Resolve symlinks and verify the real path stays within the classroom dir
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Stream the file to avoid loading large videos into memory
    const stream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    log.error(
      `Classroom media serving failed [classroomId=${classroomId}, path=${joined}]:`,
      error,
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
