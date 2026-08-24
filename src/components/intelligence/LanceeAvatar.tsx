import type { ConnectedIntelligenceActivity } from '../../lib/api'

export type LanceeAvatarState = ConnectedIntelligenceActivity['character']

const avatarPaths: Record<LanceeAvatarState, string> = {
  mail: '/img/lancee/lancee_mail.png',
  calendar: '/img/lancee/lancee_calendar.png',
  investigate: '/img/lancee/lancee_inspect.png',
  insight: '/img/lancee/lancee_idea.png',
  connected: '/img/lancee/lancee_tools.png',
  'all-clear': '/img/lancee/lancee_allclear.png',
}

export default function LanceeAvatar({
  state,
  size = 'medium',
  className = '',
}: {
  state: LanceeAvatarState
  size?: 'small' | 'medium' | 'large'
  className?: string
}) {
  return (
    <img
      className={`lancee-avatar lancee-avatar--${size} ${className}`.trim()}
      src={avatarPaths[state]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

