type DemoParserHeader = Record<string, unknown>;

type DemoParserApi = {
  (
    moduleOrPath?: string | URL | Request | Response | BufferSource | WebAssembly.Module
  ): Promise<WebAssembly.Exports>;

  parseHeader(file: Uint8Array): DemoParserHeader;

  listGameEvents(file: Uint8Array): unknown;

  parseEvent(
    file: Uint8Array,
    eventName?: string,
    wantedPlayerProps?: unknown[],
    wantedOtherProps?: unknown[]
  ): unknown;

  parseEvents(
    file: Uint8Array,
    eventNames?: unknown[],
    wantedPlayerProps?: unknown[],
    wantedOtherProps?: unknown[]
  ): unknown;

  parseTicks(
    file: Uint8Array,
    wantedProps?: unknown[],
    wantedTicks?: Int32Array,
    structOfArrays?: boolean
  ): unknown;

  parseGrenades(file: Uint8Array): unknown;
};

declare const wasm_bindgen: DemoParserApi;
