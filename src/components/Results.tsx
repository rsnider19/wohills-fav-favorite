import type { ResultRow } from '../types'

export default function Results({ results }: { results: ResultRow[] }) {
  const max = Math.max(1, ...results.map((r) => r.vote_count))
  const total = results.reduce((sum, r) => sum + r.vote_count, 0)

  return (
    <section className="border-b border-ink/15 bg-paper-deep/60" aria-label="Results">
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <p className="mb-3 text-xs font-semibold tracking-[0.25em] text-red uppercase">
          ★ The results are in
        </p>
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
            Fan Favorite
          </h2>
          <p className="text-sm text-ink/55">
            {total} neighbor{total === 1 ? '' : 's'} voted. Thanks for celebrating with us!
          </p>
        </div>

        <ol className="divide-y divide-ink/10">
          {results.map((r, i) => (
            <li key={r.entry_id} className="flex items-center gap-5 py-5">
              <span
                className={`w-10 shrink-0 font-display text-3xl italic ${
                  i === 0 ? 'text-red' : 'text-ink/30'
                }`}
              >
                {i + 1}
              </span>
              {r.image_url && (
                <img
                  src={r.image_url}
                  alt={`The ${r.theme} float by ${r.street}`}
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-xl border border-ink/10 object-cover"
                />
              )}
              <div className="min-w-0 grow">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-display text-xl font-semibold text-ink">
                    {r.theme || r.street}
                  </span>
                  <span className="shrink-0 text-lg leading-none">{r.emoji}</span>
                  {i === 0 && (
                    <span className="shrink-0 rounded-full bg-red px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-paper uppercase">
                      Winner
                    </span>
                  )}
                </div>
                <div className="truncate text-xs font-medium tracking-[0.12em] text-ink/45 uppercase">
                  {r.street}
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ${
                      i === 0 ? 'bg-red' : 'bg-ink/40'
                    }`}
                    style={{ width: `${(r.vote_count / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`font-display text-2xl font-semibold ${
                    i === 0 ? 'text-red' : 'text-ink'
                  }`}
                >
                  {r.vote_count}
                </div>
                <div className="text-[10px] font-semibold tracking-[0.2em] text-ink/40 uppercase">
                  votes
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
