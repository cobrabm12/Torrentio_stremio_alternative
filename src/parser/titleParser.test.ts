import { describe, expect, it } from 'vitest';
import { parseTitle } from './titleParser.js';

describe('parseTitle', () => {
  it('parses a rich 4K release', () => {
    const a = parseTitle('Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR10+.TrueHD.Atmos.7.1.x265-FraMeSToR');
    expect(a.resolution).toBe('2160p');
    expect(a.source).toBe('REMUX');
    expect(a.videoCodec).toBe('HEVC');
    expect(a.hdr).toContain('DV');
    expect(a.hdr).toContain('HDR10+');
    expect(a.audioCodecs).toContain('Atmos');
    expect(a.audioCodecs).toContain('TrueHD');
    expect(a.audioChannels).toBe('7.1');
    expect(a.bitDepth).toBe(10);
    expect(a.group).toBe('FraMeSToR');
  });

  it('parses a web-dl 1080p with DDP 5.1', () => {
    const a = parseTitle('The.Bear.S03E01.1080p.WEB-DL.DDP5.1.H.264-NTb');
    expect(a.resolution).toBe('1080p');
    expect(a.source).toBe('WEB-DL');
    expect(a.videoCodec).toBe('AVC');
    expect(a.audioCodecs).toContain('EAC3');
    expect(a.audioChannels).toBe('5.1');
  });

  it('detects multiple languages and multi flag', () => {
    const a = parseTitle('Movie.2021.1080p.BluRay.MULTI.x264.French.English-GROUP');
    expect(a.languages).toContain('Multi');
    expect(a.languages).toContain('French');
    expect(a.languages).toContain('English');
  });

  it('detects DTS-X and DTS-HD distinctly', () => {
    expect(parseTitle('Film 2020 1080p BluRay DTS-X 7.1 x264').audioCodecs).toContain('DTS-X');
    expect(parseTitle('Film 2020 1080p BluRay DTS-HD MA 5.1 x264').audioCodecs).toContain('DTS-HD');
  });

  it('falls back to unknown resolution', () => {
    expect(parseTitle('Some random release name').resolution).toBe('unknown');
  });

  it('detects CAM', () => {
    expect(parseTitle('New.Movie.2025.HDCAM.x264').resolution).toBe('CAM');
  });
});
