export const snapshot = (overrides: object = {}) => ({
  protocolVersion: 1,
  scriptVersion: 1,
  clock: { state: "ready", scriptTime: 0, speed: 1 },
  currentWord: null,
  passedEvents: [],
  ...overrides,
});

export const clock = (state: string, scriptTime: number, cause: string, speed = 1) => ({
  state,
  scriptTime,
  speed,
  cause,
});

export const word = (id: string, text: string, start: number, duration = 300) => ({ id, text, start, duration });

export const namedEvent = (id: string, name: string, data: unknown, scriptTime: number) => ({
  id,
  name,
  data,
  scriptTime,
});
