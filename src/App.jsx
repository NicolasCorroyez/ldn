import { useEffect, useMemo, useState } from 'react'
import csvContent from '../documentation/ldnbase.csv?raw'

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseGiftListFromCsv(rawCsv) {
  const rows = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)

  if (rows.length === 0) {
    return []
  }

  const headerRow = rows[0]
  const categories = []

  for (let column = 0; column < headerRow.length; column += 2) {
    const title = headerRow[column]
    if (!title) {
      continue
    }
    categories.push({
      title,
      column,
      items: [],
    })
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]

    categories.forEach((category) => {
      const name = row[category.column]?.trim() ?? ''
      const extra = row[category.column + 1]?.trim() ?? ''
      if (!name) {
        return
      }

      category.items.push({
        name,
        extra,
      })
    })
  }

  return categories
}

const giftCategories = parseGiftListFromCsv(csvContent)
const STORAGE_KEY = 'ldn-participations'
const participationModes = [
  { value: 'virement', label: 'Virement' },
  { value: 'achat', label: 'Achat direct' },
]

function getItemKey(categoryTitle, itemName) {
  return `${categoryTitle}::${itemName}`
}

function getInitialParticipationDraft() {
  return {
    personName: '',
    mode: 'virement',
    amount: '',
    note: '',
  }
}

function getItemState(extra) {
  if (!extra) {
    return { label: 'A offrir', style: 'bg-rose-100 text-rose-700' }
  }
  if (extra.startsWith('http')) {
    return { label: 'Lien disponible', style: 'bg-sky-100 text-sky-700' }
  }
  if (extra === 'X') {
    return { label: 'Deja prevu', style: 'bg-emerald-100 text-emerald-700' }
  }
  if (extra === '?') {
    return { label: 'A confirmer', style: 'bg-amber-100 text-amber-700' }
  }
  return { label: extra, style: 'bg-slate-100 text-slate-700' }
}

function App() {
  const [openedFormByItem, setOpenedFormByItem] = useState({})
  const [draftsByItem, setDraftsByItem] = useState({})
  const [participationsByItem, setParticipationsByItem] = useState(() => {
    if (typeof window === 'undefined') {
      return {}
    }

    try {
      const savedParticipations = window.localStorage.getItem(STORAGE_KEY)
      if (!savedParticipations) {
        return {}
      }

      const parsed = JSON.parse(savedParticipations)
      if (!parsed || typeof parsed !== 'object') {
        return {}
      }

      return parsed
    } catch {
      return {}
    }
  })

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(participationsByItem),
    )
  }, [participationsByItem])

  const totalParticipations = useMemo(() => {
    return Object.values(participationsByItem).reduce((total, current) => {
      return total + current.length
    }, 0)
  }, [participationsByItem])

  function toggleParticipationForm(itemKey) {
    setOpenedFormByItem((previous) => ({
      ...previous,
      [itemKey]: !previous[itemKey],
    }))

    setDraftsByItem((previous) => {
      if (previous[itemKey]) {
        return previous
      }
      return {
        ...previous,
        [itemKey]: getInitialParticipationDraft(),
      }
    })
  }

  function updateDraft(itemKey, field, value) {
    setDraftsByItem((previous) => ({
      ...previous,
      [itemKey]: {
        ...(previous[itemKey] ?? getInitialParticipationDraft()),
        [field]: value,
      },
    }))
  }

  function submitParticipation(event, itemKey) {
    event.preventDefault()

    const draft = draftsByItem[itemKey] ?? getInitialParticipationDraft()
    const trimmedName = draft.personName.trim()
    const trimmedAmount = draft.amount.trim()
    const trimmedNote = draft.note.trim()

    if (!trimmedName) {
      return
    }

    const participation = {
      personName: trimmedName,
      mode: draft.mode,
      amount: trimmedAmount,
      note: trimmedNote,
      createdAt: new Date().toISOString(),
    }

    setParticipationsByItem((previous) => ({
      ...previous,
      [itemKey]: [...(previous[itemKey] ?? []), participation],
    }))

    setDraftsByItem((previous) => ({
      ...previous,
      [itemKey]: getInitialParticipationDraft(),
    }))
  }

  return (
    <main className="min-h-screen bg-rose-50 px-6 py-12 text-slate-800">
      <div className="mx-auto max-w-6xl rounded-3xl bg-white p-8 shadow-lg ring-1 ring-rose-100">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900">
          Liste de naissance
        </h1>
        <p className="mb-8 text-lg text-slate-600">
          Liste importee depuis `documentation/ldnbase.csv`.
        </p>
        <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">
            Participations enregistrees: {totalParticipations}
          </p>
          <p className="mt-1">
            Chaque personne peut indiquer sa participation sur un cadeau, soit
            par virement, soit par achat direct.
          </p>
        </div>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {giftCategories.map((category) => (
            <article
              key={category.title}
              className="rounded-2xl border border-rose-100 bg-rose-50/70 p-5"
            >
              <h2 className="mb-4 text-xl font-semibold text-slate-900">
                {category.title}
              </h2>
              <ul className="space-y-3">
                {category.items.map((item) => {
                  const state = getItemState(item.extra)
                  const itemKey = getItemKey(category.title, item.name)
                  const isFormOpen = Boolean(openedFormByItem[itemKey])
                  const draft =
                    draftsByItem[itemKey] ?? getInitialParticipationDraft()
                  const participations = participationsByItem[itemKey] ?? []

                  return (
                    <li
                      key={`${category.title}-${item.name}`}
                      className="rounded-xl bg-white p-3"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-slate-800">{item.name}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${state.style}`}
                        >
                          {state.label}
                        </span>
                      </div>
                      {item.extra.startsWith('http') && (
                        <a
                          className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2"
                          href={item.extra}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Voir le lien
                        </a>
                      )}
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => toggleParticipationForm(itemKey)}
                          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          {isFormOpen
                            ? 'Fermer le formulaire'
                            : 'Je participe a cet achat'}
                        </button>
                      </div>

                      {isFormOpen && (
                        <form
                          onSubmit={(event) => submitParticipation(event, itemKey)}
                          className="mt-3 space-y-2 rounded-xl border border-rose-100 bg-rose-50 p-3"
                        >
                          <input
                            type="text"
                            value={draft.personName}
                            onChange={(event) =>
                              updateDraft(itemKey, 'personName', event.target.value)
                            }
                            placeholder="Ton prenom / nom"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                            required
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={draft.mode}
                              onChange={(event) =>
                                updateDraft(itemKey, 'mode', event.target.value)
                              }
                              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 focus:ring-2"
                            >
                              {participationModes.map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={draft.amount}
                              onChange={(event) =>
                                updateDraft(itemKey, 'amount', event.target.value)
                              }
                              placeholder="Montant (optionnel)"
                              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                            />
                          </div>

                          <textarea
                            value={draft.note}
                            onChange={(event) =>
                              updateDraft(itemKey, 'note', event.target.value)
                            }
                            rows={2}
                            placeholder="Message (optionnel)"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
                          />

                          <button
                            type="submit"
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                          >
                            Enregistrer ma participation
                          </button>
                        </form>
                      )}

                      {participations.length > 0 && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Participants
                          </p>
                          <ul className="space-y-2 text-sm text-slate-700">
                            {participations.map((participation) => (
                              <li
                                key={`${participation.createdAt}-${participation.personName}`}
                                className="rounded-lg bg-white px-2 py-1"
                              >
                                <span className="font-medium">
                                  {participation.personName}
                                </span>{' '}
                                - {participation.mode}
                                {participation.amount && ` - ${participation.amount}`}
                                {participation.note && ` - ${participation.note}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}

export default App
