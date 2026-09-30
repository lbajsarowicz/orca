export function quotePowerShellLiteral(value: string): string {
  // Why: PowerShell also ends single-quoted strings at typographic single quotes.
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`
}

export function quotePowerShellNativeArgument(value: string): string {
  // Why: Windows PowerShell 5.1 drops unescaped embedded quotes when it
  // constructs argv for native executables such as wsl.exe.
  return quotePowerShellLiteral(value.replace(/(\\*)"/g, '$1$1\\"'))
}

/**
 * Runs a PowerShell line under legacy native-argument passing, the mode 5.1 always uses and 7.x uses
 * for a `.cmd` target. With arguments quoted by quotePowerShellNativeArgument, a `"` then reaches the
 * agent's argv intact through an exe, an npm `.ps1` and an npm `.cmd` shim in both (measured).
 */
export function withLegacyNativeArgumentPassing(line: string): string {
  return `& { $PSNativeCommandArgumentPassing='Legacy'; ${line} }`
}
