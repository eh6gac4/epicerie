// Zero is reserved for the shared household data. Provider account IDs remain distinct.
export const SHARED_USER_ID = 0

export async function dataUser(c, account) {
  if (c.env.SHARED_DATA_MODE !== 'true') return account
  if (account.provider === 'telegram') {
    const member = await c.env.DB.prepare('SELECT 1 FROM shared_telegram_users WHERE tg_user_id = ?').bind(account.id).first()
    if (!member) return null
  }
  return { ...account, accountId: account.id, id: SHARED_USER_ID, shared: true }
}
