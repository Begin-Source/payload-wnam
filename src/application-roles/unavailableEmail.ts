import type { EmailAdapter } from 'payload'

/** Never use Payload's development log transport for real authentication mail. */
export const unavailableEmail: EmailAdapter = () => ({
  name: 'delivery-unavailable',
  defaultFromAddress: 'no-reply@beginos.org',
  defaultFromName: 'BeginOS',
  sendEmail: async () => { throw new Error('Email delivery is not configured') },
})
