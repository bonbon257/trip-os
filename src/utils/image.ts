/**
 * 把本地选择的图片压缩成 dataURL，用于持久化到 store / localStorage。
 *
 * 为什么不直接存 File / ObjectURL：
 *   · ObjectURL 刷新即失效，无法持久化
 *   · 原图 dataURL 体积过大（几 MB）会撑爆 localStorage（配额 ~5MB）
 * 所以统一压到 宽<=maxW、jpeg quality 的 dataURL，单图通常 <120KB。
 */
export function fileToCompressedDataURL(
  file: File,
  maxW = 900,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('当前环境不支持 canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
