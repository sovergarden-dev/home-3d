declare module "*output/server/index.mjs" {
  const application: {
    fetch(request: Request, env: unknown, context: unknown): Promise<Response> | Response;
  };
  export default application;
}
