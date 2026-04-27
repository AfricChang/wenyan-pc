import mermaid from "mermaid";
import type { ImageProcessorAction } from "@wenyan-md/ui";
import { downloadImageToBase64, FIFOCache, getPathType, localPathToBase64, resolveRelativePath } from "$lib/utils";
import { getLastArticleRelativePath } from "./stores/sqliteArticleStore";

const cache = new FIFOCache<string, string>();
let mermaidIdCounter = 0;

mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
});

async function renderMermaidInNode(node: HTMLElement) {
    const preElements = node.querySelectorAll<HTMLPreElement>("pre");
    if (preElements.length === 0) return;

    for (const preElement of preElements) {
        if (preElement.getAttribute("data-mermaid-processed")) {
            continue;
        }

        const codeElement = preElement.querySelector<HTMLElement>("code");
        if (!codeElement) continue;

        const className = codeElement.className || "";
        const isMermaid =
            className.includes("language-mermaid") ||
            className.includes("lang-mermaid") ||
            codeElement.getAttribute("data-language") === "mermaid";

        if (!isMermaid) continue;

        preElement.setAttribute("data-mermaid-processed", "true");

        try {
            const graphDefinition = codeElement.innerText?.trim() || "";
            if (!graphDefinition) continue;

            const { svg } = await mermaid.render(`mermaid-${mermaidIdCounter++}`, graphDefinition);
            preElement.innerHTML = svg;
        } catch (error) {
            console.error("Mermaid render error:", error);
            preElement.innerHTML = `<p style="color: red;">Mermaid render error</p>`;
        }
    }
}

export const imageProcessorAction: ImageProcessorAction = (node) => {
    let observer: MutationObserver;

    const run = async () => {
        const images = node.querySelectorAll<HTMLImageElement>("img");
        const relativePath = await getLastArticleRelativePath();

        for (const img of images) {
            const dataSrc = img.getAttribute("src");

            if (!dataSrc || dataSrc.startsWith("data:")) {
                continue;
            }

            const resolvedSrc = await resolveRelativePath(dataSrc, relativePath || undefined);
            const cached = cache.get(resolvedSrc);
            if (cached) {
                img.src = cached;
                continue;
            }
            try {
                if (dataSrc.startsWith("https://mmbiz.qpic.cn")) {
                    img.setAttribute("data-src", dataSrc);
                    const base64 = await downloadImageToBase64(dataSrc);
                    if (base64) {
                        cache.set(dataSrc, base64);
                        img.src = base64;
                    }
                } else if ((await getPathType(dataSrc)) !== "network") {
                    img.setAttribute("data-src", dataSrc);
                    const base64 = await localPathToBase64(resolvedSrc);
                    if (base64) {
                        cache.set(resolvedSrc, base64);
                        img.src = base64;
                    }
                }
            } catch (err) {
                console.error("Image process failed:", dataSrc, err);
            }
        }
    };

    const runAll = async () => {
        observer.disconnect();
        await run();
        await renderMermaidInNode(node);
        observer.observe(node, {
            childList: true,
            subtree: true,
        });
    };

    observer = new MutationObserver(() => {
        void runAll();
    });
    void runAll();

    return {
        destroy() {
            observer.disconnect();
            cache.clear();
        },
    };
};
