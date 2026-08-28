export const workspaceRoles = Object.freeze(['owner', 'admin', 'member'])

export function canAccessWorkspace(context, workspaceId) {
  return Boolean(
    context &&
      context.workspace?.id === workspaceId &&
      context.membership?.status === 'active' &&
      workspaceRoles.includes(context.membership?.role),
  )
}

export function hasWorkspaceRole(context, roles) {
  return canAccessWorkspace(context, context?.workspace?.id) &&
    roles.includes(context.membership.role)
}
