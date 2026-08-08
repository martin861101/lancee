import type { ClientApproval, ReviewPackageItemStatus } from '../../lib/api'

const reviewLabels: Record<ReviewPackageItemStatus, string> = {
  waiting: 'Waiting for client',
  needs_changes: 'Needs changes',
  approved: 'Approved',
}

function packageStatus(reviewPackage: ClientApproval) {
  if (reviewPackage.status === 'approved') return 'approved' as const
  if (reviewPackage.status === 'commented') return 'needs_changes' as const
  return 'waiting' as const
}

export default function ReviewPackagesPanel({
  packages,
  selectedId,
  onSelect,
  formatDate,
  compact = false,
}: {
  packages: ClientApproval[]
  selectedId: string | null
  onSelect: (id: string) => void
  formatDate: (value?: string) => string
  compact?: boolean
}) {
  const selected = packages.find((item) => item.id === selectedId) || packages[0] || null
  const comments = packages.reduce(
    (count, reviewPackage) => count + reviewPackage.items.reduce((sum, item) => sum + item.commentCount, 0),
    0,
  )
  const approvedItems = packages.flatMap((reviewPackage) => reviewPackage.items)
    .filter((item) => item.status === 'approved').length
  const totalResponded = packages.flatMap((reviewPackage) => reviewPackage.items)
    .filter((item) => item.status !== 'waiting').length
  const satisfaction = totalResponded ? Math.round((approvedItems / totalResponded) * 100) : 0

  return (
    <section className={`review-packages${compact ? ' review-packages--compact' : ''}`}>
      <header className="review-packages__header">
        <div>
          <span>Review packages</span>
          <h2>Client approval history</h2>
        </div>
        <strong>{packages.length}</strong>
      </header>

      {packages.length ? (
        <>
          <div className="review-packages__table-wrap">
            <table className="review-packages__table">
              <thead><tr><th>Package</th><th>Includes</th><th>Sent to</th><th>Sent</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {packages.map((reviewPackage, index) => {
                  const status = packageStatus(reviewPackage)
                  return (
                    <tr
                      key={reviewPackage.id}
                      className={selected?.id === reviewPackage.id ? 'is-selected' : ''}
                      onClick={() => onSelect(reviewPackage.id)}
                    >
                      <td><strong>Review #{reviewPackage.packageNumber || packages.length - index}</strong>{index === 0 && <em>Current</em>}</td>
                      <td><div className="review-package-tags">{reviewPackage.items.slice(0, 3).map((item) => <span key={item.id}>{item.title}</span>)}{reviewPackage.items.length > 3 && <span>+{reviewPackage.items.length - 3}</span>}</div></td>
                      <td><strong>{reviewPackage.clientName}</strong><small>{reviewPackage.clientEmail}</small></td>
                      <td>{formatDate(reviewPackage.createdAt)}</td>
                      <td>{formatDate(reviewPackage.dueAt || reviewPackage.expiresAt)}</td>
                      <td><span className={`review-state review-state--${status}`}>{reviewLabels[status]}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!compact && selected && (
            <div className="review-package-detail">
              <header>
                <div><span>Review package #{selected.packageNumber || 1}</span><h3>{selected.title}</h3><p>{selected.body}</p></div>
                <span className={`review-state review-state--${packageStatus(selected)}`}>{reviewLabels[packageStatus(selected)]}</span>
              </header>
              <div className="review-package-detail__items">
                {selected.items.map((item) => (
                  <article key={item.id}>
                    {item.preview?.mimeType.startsWith('image/') && (
                      <img src={`/api/projects/files/${encodeURIComponent(item.preview.id)}/download`} alt={`${item.title} preview`} />
                    )}
                    <div className="review-package-detail__copy">
                      <span>Included bucket</span>
                      <h4>{item.title}</h4>
                      <span className={`review-state review-state--${item.status}`}>{reviewLabels[item.status]}</span>
                      {item.comments.map((comment) => (
                        <blockquote key={comment.id}><strong>{comment.authorName}</strong><p>{comment.body}</p><small>{formatDate(comment.createdAt)}</small></blockquote>
                      ))}
                      {!item.comments.length && <p>No client comments on this item.</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {!compact && (
            <div className="review-package-metrics">
              <article><strong>{packages.length}</strong><span>Packages sent</span></article>
              <article><strong>{comments}</strong><span>Client comments</span></article>
              <article><strong>{packages.filter((item) => item.status === 'pending').length}</strong><span>Awaiting response</span></article>
              <article><strong>{satisfaction}%</strong><span>Client satisfaction</span></article>
            </div>
          )}
        </>
      ) : (
        <div className="review-packages__empty"><strong>No review packages yet.</strong><span>Select project buckets and send the first package to your client.</span></div>
      )}
    </section>
  )
}
