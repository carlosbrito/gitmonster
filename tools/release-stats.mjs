// Downloads por versão do GitMonster, a partir dos contadores do GitHub Releases (sem telemetria no app).
// Uso: npm run stats   (GITHUB_TOKEN opcional, só para um limite de requisições maior)
const REPO = "carlosbrito/gitmonster-releases";

const headers = { Accept: "application/vnd.github+json", "User-Agent": "gitmonster-release-stats" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

/** Só o instalador conta: latest.yml e .blockmap são baixados a cada verificação/delta, não por instalação. */
const installerDownloads = (release) =>
  release.assets.filter((a) => a.name.toLowerCase().endsWith(".exe")).reduce((sum, a) => sum + a.download_count, 0);

async function fetchReleases() {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub respondeu ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

const releases = (await fetchReleases()).filter((r) => !r.draft);
if (releases.length === 0) {
  console.log(`Nenhuma versão publicada em ${REPO}.`);
} else {
  const rows = releases.map((r) => ({
    versão: r.tag_name,
    publicada: (r.published_at ?? "").slice(0, 10),
    "downloads do instalador": installerDownloads(r),
  }));
  console.table(rows);
  console.log(`Total de downloads do instalador: ${rows.reduce((s, r) => s + r["downloads do instalador"], 0)}`);
}
