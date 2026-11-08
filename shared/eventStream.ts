/** SSE framing shared by provider and browser transports, including split UTF-8. */
export async function* readEventStream(response: Response) {
  if (!response.body) throw new Error("Không nhận được luồng phản hồi.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trimStart();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return data.length ? { event, data: data.join("\n") } : null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1_000_000) throw new Error("Luồng phản hồi quá lớn.");
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const entry = parse(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
        if (entry) yield entry;
      }
      if (done) break;
    }
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Read only the top-level message string; incomplete actions are never executed. */
export function partialMessage(json: string): string | null {
  const stringAt = (start: number) => {
    let value = "";
    for (let i = start + 1; i < json.length; i++) {
      const char = json[i];
      if (char === '"') return { value, end: i, complete: true };
      if (char !== "\\") { value += char; continue; }
      const escaped = json[++i];
      if (escaped === undefined) break;
      if (escaped === "u") {
        const digits = json.slice(i + 1, i + 5);
        if (!/^[0-9a-f]{4}$/i.test(digits)) break;
        value += String.fromCharCode(parseInt(digits, 16));
        i += 4;
      } else {
        const decoded: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (!(escaped in decoded)) break;
        value += decoded[escaped];
      }
    }
    return { value, end: json.length, complete: false };
  };
  let depth = 0, keyExpected = false;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (char === '"') {
      const token = stringAt(i);
      if (depth === 1 && keyExpected && token.complete && token.value === "message") {
        let next = token.end + 1;
        while (/\s/.test(json[next] ?? "") && next < json.length) next++;
        if (json[next++] !== ":") return null;
        while (/\s/.test(json[next] ?? "") && next < json.length) next++;
        return json[next] === '"' ? stringAt(next).value.slice(0, 4000) : null;
      }
      i = token.end;
      if (depth === 1) keyExpected = false;
    } else if (char === "{" || char === "[") {
      depth++;
      if (depth === 1 && char === "{") keyExpected = true;
    } else if (char === "}" || char === "]") depth--;
    else if (char === "," && depth === 1) keyExpected = true;
  }
  return null;
}
