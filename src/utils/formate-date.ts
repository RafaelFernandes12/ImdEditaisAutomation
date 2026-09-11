export function formatDate(date: Date) {
  const day = date.getDate() < 10 ? `0${date.getDate()}` : date.getDate();
  const month =
    date.getMonth() + 1 < 10 ? `0${date.getMonth() + 1}` : date.getMonth() + 1;
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatDateBrToUs(date: string) {
  const month = date[3] + date[4];
  const day = date[0] + date[1];
  const year = date[6] + date[7] + date[8] + date[9];
  const usDate = `${month}/${day}/${year}`;
  return new Date(usDate);
}
