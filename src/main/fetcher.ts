import type { FetchProgress } from '../shared/contract'
import { listJournalsToFetch, setJournalFetchStatus, upsertIssuePapers } from './db'
import { fetchRecentIssues } from './openalex'
import { getSettings } from './settings'

const MAX_ISSUES_PER_JOURNAL = 7

export async function startFetch(
  journalIds: string[] | undefined,
  onProgress: (p: FetchProgress) => void
): Promise<void> {
  const journals = listJournalsToFetch(journalIds)
  const mailto = getSettings().mailto ?? ''

  for (const journal of journals) {
    setJournalFetchStatus(journal.id, 'fetching')
    let issuesFetched = 0
    let papersFetched = 0
    try {
      const issues = await fetchRecentIssues(
        { openalexSourceId: journal.openalexSourceId, issn: journal.issn },
        MAX_ISSUES_PER_JOURNAL,
        mailto
      )
      for (const { issue, papers } of issues) {
        upsertIssuePapers(journal.id, issue, papers)
        issuesFetched += 1
        papersFetched += papers.length
        onProgress({
          journalId: journal.id,
          journalName: journal.name,
          status: 'fetching',
          issuesFetched,
          papersFetched,
          message: `已抓取 ${issuesFetched} 个 issue，共 ${papersFetched} 篇`
        })
      }
      setJournalFetchStatus(journal.id, 'done')
      onProgress({
        journalId: journal.id,
        journalName: journal.name,
        status: 'done',
        issuesFetched,
        papersFetched,
        message: `完成：${issuesFetched} 个 issue，${papersFetched} 篇`
      })
    } catch (err) {
      setJournalFetchStatus(journal.id, 'error')
      onProgress({
        journalId: journal.id,
        journalName: journal.name,
        status: 'error',
        issuesFetched,
        papersFetched,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}
