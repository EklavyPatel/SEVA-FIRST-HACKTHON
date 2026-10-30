// Test double for the official SDK interface. Does not make network requests.
export const sdkMock = generateContent => async () => ({ models: { generateContent } });
export const sdkResponse = value => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
export const sdkFailure = status => sdkMock(async () => { throw Object.assign(new Error('TEST PRIVATE PROVIDER ERROR'), { status }); });
