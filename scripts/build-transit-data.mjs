import { buildTransitBundle, TRANSIT_SOURCE_DIR } from "./transit-data-source.mjs";

const bundle = await buildTransitBundle();
console.log(`Validated transit data ${bundle.version.slice(0, 12)} from ${TRANSIT_SOURCE_DIR}.`);
console.log(`${bundle.metadata.lines.length} lines, ${bundle.metadata.lines.reduce((count, line) => count + line.d.length, 0)} directions, ${bundle.stops.s.length} shortcut stops.`);
