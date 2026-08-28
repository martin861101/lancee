import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { MemberAvatar, MemberBadge, type WorkspaceMember } from '../workspace/WorkspaceMember'
import './dashboard-page.css'

export default function TeamPage({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteLink, setInviteLink] = useState('')

  const load = useCallback(async () => setMembers(await api.team.list() as WorkspaceMember[]), [])
  useEffect(() => { void load().catch(() => setError('Unable to load workspace members.')).finally(() => setLoading(false)) }, [load])
  const stats = useMemo(() => ({ active: members.filter((member) => member.status === 'active').length, invited: members.filter((member) => member.status === 'invited').length }), [members])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const invitation = await api.team.invite({ email, name: name || undefined, role })
      setInviteOpen(false); setEmail(''); setName(''); setInviteLink(invitation.acceptUrl || ''); await load()
      setNotice(invitation.delivery === 'sent' ? `Invitation sent to ${invitation.email}.` : `Invitation created for ${invitation.email}.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send invitation.') } finally { setBusy(false) }
  }
  const changeRole = async (member: WorkspaceMember, nextRole: 'admin' | 'member') => {
    setBusy(true); setError('')
    try { await api.team.update(member.id, { role: nextRole }); await load(); setNotice(`${member.name || member.email} is now a ${nextRole}.`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to change role.') } finally { setBusy(false) }
  }
  const disable = async (member: WorkspaceMember) => {
    if (!window.confirm(`Disable ${member.name || member.email}'s access?`)) return
    setError('')
    try { await api.team.remove(member.id); await load(); setNotice(member.status === 'invited' ? 'Invitation revoked.' : 'Member access disabled.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update this member.') }
  }
  const resend = async (member: WorkspaceMember) => {
    setBusy(true); setError('')
    try { const result = await api.team.resend(member.id); setNotice(result.delivery === 'sent' ? `Invitation resent to ${member.email}.` : `Invitation refreshed for ${member.email}.`); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend invitation.') } finally { setBusy(false) }
  }

  return <div className="content-container animate-fade-in dashboard-page">
    <header className="dashboard-page__header"><div><h2 className="dashboard-page__title">Team <em>members</em></h2><p className="dashboard-page__description">People with access to this workspace.</p></div>{canManage && <button type="button" className="button button--primary" onClick={() => setInviteOpen(true)}>Invite member</button>}</header>
    {error && <div className="dashboard-alert">{error}</div>}{notice && <div className="dashboard-alert dashboard-alert--success">{notice}</div>}
    {inviteLink && <div className="dashboard-link-form"><label>Invitation link <input value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} /></label><button type="button" className="button button--secondary" onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => setNotice('Invitation link copied.')).catch(() => setError('Unable to copy invitation link.'))}>Copy link</button></div>}
    <div className="dashboard-stat-grid"><div className="dashboard-stat"><span>Members</span><strong>{members.length}</strong></div><div className="dashboard-stat"><span>Active</span><strong>{stats.active}</strong></div><div className="dashboard-stat"><span>Pending invitations</span><strong>{stats.invited}</strong></div></div>
    {canManage && inviteOpen && <form className="dashboard-link-form" onSubmit={invite}><h3>Invite to this workspace</h3><div className="dashboard-link-form__grid"><label>Name <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" /></label><label>Email <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Role <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="member">Member</option><option value="admin">Admin</option></select></label></div><div className="dashboard-link-form__footer"><button className="button button--primary" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button><button type="button" className="button button--ghost" onClick={() => setInviteOpen(false)}>Cancel</button></div></form>}
    {loading ? <div className="skeleton-line" style={{ height: '180px' }} /> : <div className="dashboard-panel"><table className="dashboard-table"><thead><tr><th>Member</th><th>Role / status</th><th>Joined</th>{canManage && <th>Actions</th>}</tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="team-member"><MemberAvatar member={member} /><div><strong>{member.name || member.email}</strong><small>{member.email}</small></div></div></td><td><MemberBadge role={member.role} status={member.status} /></td><td>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'Pending'}</td>{canManage && <td><div className="team-row-actions">{member.status === 'invited' && <button className="button button--ghost button--small" disabled={busy} onClick={() => void resend(member)}>Resend</button>}{member.role !== 'owner' && member.status !== 'disabled' && <><button className="button button--secondary button--small" disabled={busy} onClick={() => void changeRole(member, member.role === 'admin' ? 'member' : 'admin')}>{member.role === 'admin' ? 'Make member' : 'Make admin'}</button><button className="button button--danger button--small" disabled={busy} onClick={() => void disable(member)}>{member.status === 'invited' ? 'Revoke' : 'Disable'}</button></>}</div></td>}</tr>)}{!members.length && <tr><td className="dashboard-empty" colSpan={canManage ? 4 : 3}>No members found.</td></tr>}</tbody></table></div>}
  </div>
}
