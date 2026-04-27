import { domToPng } from "modern-screenshot";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { globalState } from "@wenyan-md/ui";
import { downloadImageToBase64 } from "$lib/utils";

async function rasterizeMermaidSvgs(root: HTMLElement) {
    const svgElements = root.querySelectorAll<SVGSVGElement>('pre[data-mermaid-processed="true"] svg');
    if (svgElements.length === 0) return;

    const xmlSerializer = new XMLSerializer();

    await Promise.all(
        Array.from(svgElements).map(async (svgElement) => {
            const rect = svgElement.getBoundingClientRect();
            const width = Math.max(1, Math.ceil(rect.width));
            const height = Math.max(1, Math.ceil(rect.height));

            if (width <= 1 || height <= 1) return;

            let svgText = xmlSerializer.serializeToString(svgElement);
            if (!svgText.includes("xmlns=")) {
                svgText = svgText.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            if (!svgText.includes("xmlns:xlink=")) {
                svgText = svgText.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            }

            const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
            const objectUrl = URL.createObjectURL(blob);

            try {
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error("Failed to load mermaid svg"));
                    img.src = objectUrl;
                });

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) return;

                context.drawImage(image, 0, 0, width, height);

                const pngDataUrl = canvas.toDataURL("image/png");
                const imgElement = document.createElement("img");
                imgElement.src = pngDataUrl;
                imgElement.width = width;
                imgElement.height = height;
                imgElement.style.display = "block";
                imgElement.style.width = `${width}px`;
                imgElement.style.height = `${height}px`;

                svgElement.replaceWith(imgElement);
            } catch (error) {
                console.error("Mermaid rasterize error:", error);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        })
    );
}

export async function exportImage() {
    const element = document.getElementById("wenyan");
    if (!element) return;

    let bgColor = window.getComputedStyle(document.body).backgroundColor;
    // 如果获取到的是透明色 (rgba(0, 0, 0, 0)) 或者 transparent，设置为白色
    if (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") {
        bgColor = "#ffffff";
    }

    // 1. 克隆并配置
    const clonedWenyan = element.cloneNode(true) as HTMLElement;
    Object.assign(clonedWenyan.style, {
        position: "fixed",
        top: "0",
        left: "0",
        zIndex: "-9999",
        width: "420px",
        backgroundColor: bgColor,
        pointerEvents: "none",
    });

    try {
        globalState.isLoading = true;
        // 2. 处理图片替换 (等待全部下载完成)
        const images = clonedWenyan.querySelectorAll("img");
        const promises = Array.from(images).map(async (img) => {
            if (!img.src.startsWith("data:")) {
                img.src = await downloadImageToBase64(img.src);
            }
        });
        await Promise.all(promises); // 等待所有图片下载完再往下走

        // 3. 挂载 DOM
        document.body.appendChild(clonedWenyan);

        // 4. 对 mermaid svg 预先栅格化，避免导出失败
        await rasterizeMermaidSvgs(clonedWenyan);

        // 5. 生成图片 (此时 clonedWenyan 确定在 DOM 中)
        const dataUrl = await domToPng(clonedWenyan, {
            scale: 2,
            backgroundColor: bgColor,
            fetch: { requestInit: { mode: "cors" } },
        });

        // 6. 保存逻辑
        const filePath = await save({
            title: "保存导出的图片",
            filters: [{ name: "Image", extensions: ["png"] }],
            defaultPath: "wenyan-export.png",
        });

        if (filePath) {
            const base64Part = dataUrl.split(",")[1];
            const binaryString = atob(base64Part);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            await writeFile(filePath, bytes);
        }
    } catch (error) {
        console.error("保存失败:", error);
        globalState.setAlertMessage({
            type: "error",
            message: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
        });
    } finally {
        if (clonedWenyan.parentNode) {
            document.body.removeChild(clonedWenyan);
        }
        globalState.isLoading = false;
    }
}
