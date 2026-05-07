# Basketball Scoreboard App

A responsive basketball scoreboard built with React, TypeScript, and Vite.

## Features

- Editable HOME and AWAY team names
- Score controls: +1, +2, +3, -1, -2, -3
- Team fouls with add/remove controls
- Team timeouts with use/add controls
- 12:00 game clock with start, pause, reset, and custom time
- Quarter controls from Q1 to Q4
- 24-second shot clock with 24, 14, and 0 reset buttons
- End Quarter button
- Reset Everything button with confirmation
- Custom hotkeys for every scoreboard control button
- Hotkey settings panel with Change, Clear, and Restore Default options
- Basketball horn/buzzer controlled by the space bar only
- Hold Space for continuous horn
- Release Space to stop the horn with a reverb tail
- Game clock and shot clock end buzzers also use the reverb tail

## Important horn behavior

The horn button is intentionally not clickable. It is only a visual indicator.

Use this control instead:

```txt
Hold Space = continuous horn
Release Space = stop horn with reverb
```

Space is reserved for the horn and cannot be assigned to other controls.

## Run the app

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

## Build for production

```bash
npm run build
```

## Horn audio file

The app includes a generated horn file:

```txt
public/basketball-horn.wav
```

To use your own horn sound, replace that file with your preferred audio file and keep the same filename.
