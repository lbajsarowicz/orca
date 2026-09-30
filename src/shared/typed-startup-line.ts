/** Half of macOS MAX_CANON: a typed line this long survived every canonical-mode write measured,
 *  and 1 KiB did not. */
export const TYPED_STARTUP_LINE_BUDGET_BYTES = 512

/** Under Linux's 4,095-byte canonical line: a WSL shell reads a line typed before its line editor is
 *  up in canonical mode, and a 5,023-byte line was measured losing its closing quote there. */
export const WSL_TYPED_STARTUP_LINE_BUDGET_BYTES = 4000

/** cmd.exe's documented line cap, the smallest of the Windows shells Orca types into. */
export const WINDOWS_TYPED_STARTUP_LINE_MAX_CHARS = 8191

const encoder = new TextEncoder()

/** Any C0 byte or DEL: no quoter escapes them, so a line editor reads them as keys. */
function hasControlByte(line: string): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const code = line.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

/** Whether a startup line can be typed into a shell as it is: every failure a long or multi-line
 *  typed line has (Enter mid-line, keys, MAX_CANON truncation) is a property of the line. */
export function typedStartupLineFits(line: string): boolean {
  return !hasControlByte(line) && encoder.encode(line).byteLength <= TYPED_STARTUP_LINE_BUDGET_BYTES
}

/** The same question for a Windows host, which cannot stage: only its own line cap applies. */
export function windowsTypedStartupLineFits(line: string): boolean {
  return !hasControlByte(line) && line.length <= WINDOWS_TYPED_STARTUP_LINE_MAX_CHARS
}

/** The same question for a WSL session, which neither stages a line nor reads a launch file. */
export function wslTypedStartupLineFits(line: string): boolean {
  return (
    !hasControlByte(line) && encoder.encode(line).byteLength <= WSL_TYPED_STARTUP_LINE_BUDGET_BYTES
  )
}
