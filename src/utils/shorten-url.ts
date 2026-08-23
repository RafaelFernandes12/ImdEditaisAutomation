export async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
    );

    if (!response.ok) return url;

    const shortened = await response.text();

    return shortened.startsWith('http') ? shortened : url;
  } catch {
    return url;
  }
}
