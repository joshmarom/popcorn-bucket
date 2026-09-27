const ACK_KEY = 'pb.networkNoticeAcknowledged'

export const NETWORK_NOTICE_TEXT =
  'While a download is in progress, your IP address is visible to the other people sharing the same torrent. Popcorn Bucket stops sharing as soon as a download finishes and plays finished movies straight from your disk.'

export function hasAcknowledgedNetworkNotice(): boolean {
  try {
    return window.localStorage.getItem(ACK_KEY) === '1'
  } catch {
    return false
  }
}

export function acknowledgeNetworkNotice(): void {
  try {
    window.localStorage.setItem(ACK_KEY, '1')
  } catch {
    /* storage unavailable; the notice shows again next time */
  }
}
