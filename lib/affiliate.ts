const AFFILIATE_TAG = 'pulseprice-20'

export function buildAffiliateUrl(amazonUrl: string): string {
  try {
    const url = new URL(amazonUrl)
    url.searchParams.set('tag', AFFILIATE_TAG)
    return url.toString()
  } catch {
    const separator = amazonUrl.includes('?') ? '&' : '?'
    return `${amazonUrl}${separator}tag=${AFFILIATE_TAG}`
  }
}

export function buildAsinUrl(asin: string): string {
  return buildAffiliateUrl(`https://www.amazon.com/dp/${asin}`)
}
