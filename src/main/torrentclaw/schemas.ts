import { z } from 'zod'

const nullableString = z.string().nullable().optional()
const nullableNumber = z.number().nullable().optional()
/** Ratings arrive as strings such as "8.4". */
const ratingString = z.union([z.string(), z.number()]).nullable().optional()

export const tcAudioTrackSchema = z.object({
  lang: nullableString,
  codec: nullableString,
  channels: nullableNumber
})

export const tcTorrentSchema = z.object({
  infoHash: z.string().optional(),
  magnetUrl: z.string().optional(),
  torrentUrl: z.string().optional(),
  rawTitle: z.string(),
  quality: nullableString,
  codec: nullableString,
  sourceType: nullableString,
  sizeBytes: z.union([z.number(), z.string()]).nullable().optional(),
  seeders: z.number().default(0),
  leechers: z.number().default(0),
  source: nullableString,
  qualityScore: nullableNumber,
  uploadedAt: nullableString,
  languages: z.array(z.string()).nullable().optional(),
  hdrType: nullableString,
  releaseGroup: nullableString,
  season: nullableNumber,
  episode: nullableNumber,
  scanStatus: nullableString,
  audioTracks: z.array(tcAudioTrackSchema).nullable().optional(),
  subtitleLanguages: z.array(z.string()).nullable().optional(),
  videoInfo: z
    .object({
      hdr: nullableString,
      codec: nullableString,
      height: nullableNumber
    })
    .nullable()
    .optional()
})
export type TcTorrent = z.infer<typeof tcTorrentSchema>

export const tcSearchResultSchema = z.object({
  id: z.number(),
  imdbId: nullableString,
  tmdbId: z.union([z.number(), z.string()]).nullable().optional(),
  contentType: z.enum(['movie', 'show']),
  title: z.string(),
  year: nullableNumber,
  overview: nullableString,
  posterUrl: nullableString,
  backdropUrl: nullableString,
  genres: z.array(z.string()).nullable().optional(),
  rating: ratingString,
  contentUrl: nullableString,
  torrents: z.array(tcTorrentSchema).nullable().optional()
})
export type TcSearchResult = z.infer<typeof tcSearchResultSchema>

export const tcSearchResponseSchema = z.object({
  total: z.number().optional(),
  results: z.array(tcSearchResultSchema)
})

export const tcListItemSchema = z.object({
  id: z.number(),
  tmdbId: z.union([z.number(), z.string()]).nullable().optional(),
  title: z.string(),
  contentType: z.enum(['movie', 'show']).nullable().optional(),
  year: nullableNumber,
  posterUrl: nullableString,
  backdropUrl: nullableString,
  overview: nullableString,
  genres: z.array(z.string()).nullable().optional(),
  rating: ratingString,
  maxSeeders: nullableNumber,
  releaseDate: nullableString,
  hasTorrents: z.boolean().optional()
})
export type TcListItem = z.infer<typeof tcListItemSchema>

export const tcListResponseSchema = z.object({
  items: z.array(tcListItemSchema),
  total: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional()
})

export const tcStreamingTopSchema = z.array(
  tcListItemSchema.omit({ id: true }).extend({
    rank: z.number(),
    contentId: nullableNumber,
    localPosterUrl: nullableString
  })
)

export const tcCollectionSchema = z.object({
  id: z.number(),
  tmdbId: nullableNumber,
  name: z.string(),
  posterUrl: nullableString,
  backdropUrl: nullableString,
  movieCount: z.number().default(0),
  totalSeeders: z.number().default(0),
  overview: nullableString
})

export const tcCollectionListSchema = z.object({
  items: z.array(tcCollectionSchema)
})

export const tcCollectionDetailSchema = tcCollectionSchema.extend({
  movies: z.array(tcListItemSchema)
})

export const tcAutocompleteSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      year: nullableNumber,
      contentType: z.enum(['movie', 'show', 'collection']),
      posterUrl: nullableString,
      movieCount: nullableNumber
    })
  )
})
