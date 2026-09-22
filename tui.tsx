// Local plugin entrypoint.
//
// `file://` directory targets in cli.json resolve a root `tui.tsx` (the same
// layout OpenCode uses for discovered plugins under <config>/plugins/<name>/).
// Published installs resolve the `./tui` export in package.json instead, so
// both paths share the implementation in src/tui.tsx.
export { default } from "./src/tui";
