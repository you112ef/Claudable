import { NextRequest, NextResponse } from 'next/server';
import { ensureProjectUploadDir, absolutePathForUpload } from '@/lib/server/store';
import path from 'path';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ detail: 'file is required' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploadDir = await ensureProjectUploadDir(projectId);
    const safeName = (file as File).name?.replace(/[^a-zA-Z0-9._-]/g, '_') || `upload_${Date.now()}`;
    const targetPath = path.join(uploadDir, safeName);
    await fs.writeFile(targetPath, bytes);
    return NextResponse.json({
      filename: safeName,
      path: targetPath,
      absolute_path: targetPath
    });
  } catch (e: any) {
    return NextResponse.json({ detail: e?.message || 'Upload failed' }, { status: 500 });
  }
}

