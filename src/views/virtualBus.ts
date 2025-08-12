import { VirtualDocProvider } from "./VirtualDocProvider";

let _provider: VirtualDocProvider | undefined;
export function setVirtualProvider(p: VirtualDocProvider) { _provider = p; }
export function getVirtualProvider(): VirtualDocProvider | undefined { return _provider; }