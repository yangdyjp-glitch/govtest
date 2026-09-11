import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const mathNS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const wordNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Preserve common Word equation objects as text before Mammoth extracts paragraphs.
export async function preserveWordMath(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Word 文件缺少正文，请重新导出为 DOCX。");
  const xml = await entry.async("string");
  if (xml.length > 8_000_000)
    throw new Error("Word 正文过大，请拆分题库后导入。");
  if (!xml.includes(mathNS)) return buffer;
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {
        throw new Error("Word 公式结构损坏，请检查原文件。");
      },
      fatalError: () => {
        throw new Error("Word 文件结构损坏，请检查原文件。");
      },
    },
  }).parseFromString(xml, "application/xml");
  const children = (element: Element): Element[] =>
    Array.from(element.childNodes).filter(
      (node) => node.nodeType === 1,
    ) as Element[];
  const child = (element: Element, name: string) =>
    children(element).find(
      (node) => node.localName === name && node.namespaceURI === mathNS,
    );
  function read(element: Element): string {
    const part = (name: string) => {
      const node = child(element, name);
      if (!node) throw new Error("Missing equation part");
      return read(node);
    };
    if (element.localName === "t") return element.textContent || "";
    if (/Pr$/.test(element.localName)) return "";
    if (element.localName === "f")
      return `\\frac{${part("num")}}{${part("den")}}`;
    if (element.localName === "rad") {
      const degree = child(element, "deg"),
        index = degree ? read(degree).trim() : "";
      return `\\sqrt${index ? `[${index}]` : ""}{${part("e")}}`;
    }
    if (["sSup", "sSub", "sSubSup"].includes(element.localName)) {
      const base = part("e"),
        grouped = /^[A-Za-z0-9α-ωΑ-Ω]+$/.test(base) ? base : `(${base})`;
      return `${grouped}${element.localName !== "sSup" ? `_{${part("sub")}}` : ""}${element.localName !== "sSub" ? `^{${part("sup")}}` : ""}`;
    }
    if (element.localName === "d") {
      const props = child(element, "dPr");
      const delimiter = (name: string, fallback: string) => {
        const node = props && child(props, name);
        return node ? node.getAttributeNS(mathNS, "val") : fallback;
      };
      const content = children(element).filter(
        (node) => node.localName === "e",
      );
      if (content.length !== 1) throw new Error("Unsupported equation array");
      return `${delimiter("begChr", "(")}${read(content[0])}${delimiter("endChr", ")")}`;
    }
    if (
      ["oMath", "r", "e", "num", "den", "deg", "sup", "sub"].includes(
        element.localName,
      )
    )
      return children(element).map(read).join("");
    throw new Error("Unsupported equation object");
  }
  const equations = Array.from(
    document.getElementsByTagNameNS(mathNS, "oMath"),
  );
  for (const equation of equations) {
    let value: string;
    try {
      value = read(equation as unknown as Element);
      value = value ? `\\(${value}\\)` : "【待核对公式：公式内容为空】";
    } catch {
      const fragments = Array.from(equation.getElementsByTagNameNS(mathNS, "t"))
        .map((node) => node.textContent)
        .join("；");
      value = `【待核对公式：${fragments || "请对照原文件公式对象"}】`;
    }
    const text = document.createElementNS(wordNS, "w:t");
    text.setAttribute("xml:space", "preserve");
    text.appendChild(
      document.createTextNode(value || "【待核对公式：公式内容为空】"),
    );
    const parent = equation.parentNode!;
    if (parent.nodeName === "w:r") parent.replaceChild(text, equation);
    else {
      const run = document.createElementNS(wordNS, "w:r");
      run.appendChild(text);
      parent.replaceChild(run, equation);
    }
  }
  for (const paragraph of Array.from(
    document.getElementsByTagNameNS(mathNS, "oMathPara"),
  )) {
    const parent = paragraph.parentNode!;
    for (const node of Array.from(paragraph.childNodes)) {
      if (node.nodeType === 1 && (node as Element).namespaceURI === wordNS)
        parent.insertBefore(node, paragraph);
    }
    parent.removeChild(paragraph);
  }
  if (!equations.length) return buffer;
  zip.file(
    "word/document.xml",
    new XMLSerializer().serializeToString(document),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
