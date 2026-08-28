/**
 * Deploy Render backend via API — trigger "deploy latest commit" untuk service tertentu.
 *
 * Dipakai pascalinar: setelah `git push`, agent memanggil script ini agar Render
 * benar-benar menerima commit terbaru (auto-deploy free tier tidak andal).
 *
 * Prasyarat env:
 *   RENDER_API_KEY  — API key Render (Dashboard → Account Settings → API Keys)
 *   RENDER_SERVICE_ID — ID service (bisa dicari lewat GET /v1/services pakai API key)
 *
 * Opsional:
 *   RENDER_SERVICE_ID auto-detect bila tidak di-set: cari service dengan nama
 *   dari env RENDER_SERVICE_NAME (default "siak-backend").
 */
import 'dotenv/config';

const API = 'https://api.render.com/v1';

async function findServiceId(apiKey: string, name: string): Promise<string> {
  const res = await fetch(`${API}/services?limit=100&type=web_service`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal ambil daftar service (${res.status}): ${body.slice(0, 200)}`);
  }
  const services = (await res.json()) as Array<{ id: string; name: string }>;
  const match = services.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    throw new Error(
      `Service "${name}" tidak ditemukan. Terdaftar: ${services.map((s) => s.name).join(', ') || '(kosong)'}`,
    );
  }
  return match.id;
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    console.error(
      'RENDER_API_KEY belum di-set. Ambil dari Render Dashboard → Account Settings → API Keys, lalu set env.',
    );
    process.exit(1);
  }
  const serviceName = process.env.RENDER_SERVICE_NAME ?? 'siak-backend';
  const serviceId = process.env.RENDER_SERVICE_ID ?? (await findServiceId(apiKey, serviceName));

  const res = await fetch(`${API}/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal trigger deploy (${res.status}): ${body.slice(0, 300)}`);
  }
  const deploy = (await res.json()) as { id: string; status: string; commit?: { id?: string } };
  console.log(
    `Deploy triggered → service=${serviceName} id=${serviceId} deployId=${deploy.id} status=${deploy.status} commit=${deploy.commit?.id ?? ''}`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
