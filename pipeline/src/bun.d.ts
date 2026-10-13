interface BunFile {
  text(): Promise<string>;
}

declare const Bun: {
  argv: string[];
  file(path: string): BunFile;
  write(path: string, data: string): Promise<number>;
};

interface ImportMeta {
  main?: boolean;
}
