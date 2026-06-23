const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g
const OPEN_SHELL_TIMESTAMP_PATTERN = /\[(\d{10})(?:\.(\d{1,6}))?\]/g

function formatOpenShellTimestamp(secondsText: string, fractionText = '') {
  const seconds = Number(secondsText)
  if (!Number.isFinite(seconds)) return null

  const milliseconds = Math.round(Number(`0.${fractionText || '0'}`) * 1000)
  const date = new Date((seconds * 1000) + milliseconds)
  const year = date.getUTCFullYear()
  if (year < 2000 || year > 2100) return null

  return date.toISOString().replace('T', ' ').replace('Z', 'Z')
}

function removeBackspaceSequences(value: string) {
  let output = value
  while (output.includes('\b')) {
    const next = output.replace(/[^\n]\b/g, '').replace(/^\b/gm, '')
    if (next === output) return next.replace(/\b/g, '')
    output = next
  }
  return output
}

export function cleanTerminalOutput(value: string | null | undefined) {
  if (!value) return ''
  return removeBackspaceSequences(value)
    .replace(OSC_PATTERN, '')
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n?/g, '\n')
    .replace(OPEN_SHELL_TIMESTAMP_PATTERN, (match, secondsText: string, fractionText: string) => {
      const formatted = formatOpenShellTimestamp(secondsText, fractionText)
      return formatted ? `[${formatted}]` : match
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .trim()
}
