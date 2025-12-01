declare module "js-yaml" {
  // Minimal typings sufficient for our usage
  export function load(str: string, opts?: unknown): any;
}

