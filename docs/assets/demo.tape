# docs/assets/demo.tape
# MiSeGuard demo — shows Green pass-through, Yellow dry-run, Red blocks

Output docs/assets/demo.gif
Set Shell "pwsh"
Set FontSize 16
Set Width 1000
Set Height 500
Set Theme "Dracula"
Set TypingSpeed 30ms
Set PlaybackSpeed 1.0
Set Padding 20

# Intro
Type "# MiSeGuard — circuit breaker for autonomous agents"
Enter
Sleep 800ms

Type "clear"
Enter
Sleep 300ms

# 1. Green — safe command allowed
Type "miseguard check 'git status'"
Enter
Sleep 1s

# 2. Yellow — cautionary command triggers dry-run
Type "miseguard check 'npm install -g pnpm'"
Enter
Sleep 1.2s

# 3. Red — destructive command blocked
Type "miseguard check 'rm -rf /'"
Enter
Sleep 2s

# 4. Red — sensitive file access blocked
Type "miseguard check 'cat .env'"
Enter
Sleep 2s

# Outro
Type "echo 'MiSeGuard demo complete.'"
Enter
Sleep 1s
