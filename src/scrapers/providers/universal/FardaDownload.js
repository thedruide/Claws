const cheerio = require('cheerio');
const BaseProvider = require('../BaseProvider');

module.exports = class FardaDownload extends BaseProvider {
    /** @inheritdoc */
    getUrls() {
        return ['https://fardadownload.org', 'https://1fardadl.com'];
    }

    /** @inheritdoc */
    async scrape(url, req, ws) {
        const title = req.query.title.toLowerCase();
        const year = req.query.year;
        const season = req.query.season;
        const episode = req.query.episode;
        const type = req.query.type;
        const resolvePromises = [];
        let headers = {};

        try {
            let searchTitle = `${title} ${year}`;
            let searchUrl = this._generateUrl(url, {s: searchTitle});
            const rp = this._getRequest(req, ws);
            const jar = rp.jar();
            const response = await this._createRequest(rp, searchUrl, jar, headers);

            let $ = cheerio.load(response);

            let videoPage = '';
            $('.post-title a').toArray().forEach(element => {
                // Replace is used because Farda uses a different apostrophe character...
                let contentTitle = $(element).find('h2').text().toLowerCase().replace('’', '\'');
                let contentPage = $(element).attr('href');

                if (contentTitle.includes(searchTitle)) {
                    videoPage = contentPage;
                }
            });
            if (!videoPage) {
                return Promise.resolve();
            }

            const videoPageHTML = await this._createRequest(rp, videoPage, jar, headers);

            $ = cheerio.load(videoPageHTML);

            if (type == 'tv') {
                let seasonHeader = '';
                $(`div.title-season`).toArray().forEach(element => {
                    const seasonTitle = $(element).text();
                    if (seasonTitle.endsWith(` ${season}`)) {
                        seasonHeader = seasonTitle;
                        return;
                    }
                });
                const matchedSection = $('div.title-season').filter(function () {
                    return $(this).text() == seasonHeader;
                }).nextUntil('div.title-season', 'div').toArray();
                for (const section of matchedSection) {
                    const folderOrEpisodeLink = $(section).find('a.downloadf').attr('href');
                    const paddedSeason = `${season}`.padStart(2, '0');
                    const paddedEpisode = `${episode}`.padStart(2, '0');
                    const formattedEpisode = `s${paddedSeason}e${paddedEpisode}`;
                    // Link is a link to a folder (older seasons / episodes)
                    if ((folderOrEpisodeLink.includes('http://') || folderOrEpisodeLink.includes('https://')) && folderOrEpisodeLink.endsWith(`/`)) {
                        const folderHTML = await this._createRequest(rp, folderOrEpisodeLink, jar, headers);

                        $ = cheerio.load(folderHTML);
                        $('a').toArray().forEach(element => {
                            const fileName = $(element).text();
                            if (fileName.toLowerCase().includes(formattedEpisode)) {
                                const filePath = $(element).attr('href');
                                const directLink = this._absoluteUrl(folderOrEpisodeLink, filePath);
                                resolvePromises.push(this.resolveLink(directLink, ws, jar, headers, '', { isDDL: true }));
                            }
                        });
                    } else {
                        // Link is a to the episode (newer seasons / episodes)
                        if (folderOrEpisodeLink.toLowerCase().includes(formattedEpisode)) {
                            resolvePromises.push(this.resolveLink(folderOrEpisodeLink, ws, jar, headers, '', { isDDL: true }));
                        };
                    }
                }
            } else {
                $('a.dl_bx_mv').toArray().forEach(element => {
                    const directLink = $(element).attr('href');
                    resolvePromises.push(this.resolveLink(directLink, ws, jar, headers, '', { isDDL: true }));
                });
            }
        } catch (err) {
            this._onErrorOccurred(err)
        }
        return Promise.all(resolvePromises)
    }
}
