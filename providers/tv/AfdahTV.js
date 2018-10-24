const rp = require('request-promise');
const cheerio = require('cheerio');
const AES = require('crypto-js/aes');

const Openload = require('../../resolvers/Openload');
const padTvNumbers = require("../../utils/padTvNumbers");

async function AfdahTV(req, sse) {
    const title = req.query.title;
    const season = padTvNumbers(req.query.season);
    const episode = padTvNumbers(req.query.episode);

    const url = 'https://afdah.to';
    const promises = [];
    var jar = rp.jar();

    try {
        const html = await rp({
            uri: `${url}/wp-content/themes/afdah/ajax-search2.php`,
            headers: {
                'x-real-ip': req.client.remoteAddress,
                'x-forwarded-for': req.client.remoteAddress
            },
            method: 'POST',
            form: {
                process: AES.encrypt(title + '|||' + 'title', "Watch Movies Online").toString()
            },
            jar,
            timeout: 5000
        });

        let $ = cheerio.load(html);
        let videoId = '';

        $('a').toArray().some(element => {
            const videoName = $(element).text();
            if (videoName === title) {
                videoId = $(element).attr('href');
                return true;
            }

            return false;
        });

        const videoPageHtml = await rp({
            uri: `${url}${videoId}`,
            headers: {
                'x-real-ip': req.client.remoteAddress,
                'x-forwarded-for': req.client.remoteAddress
            },
            jar,
            timeout: 5000
        });

        $ = cheerio.load(videoPageHtml);

        if($('#tabs').find('a[content="cont_1"]').text() === 'Watch TV') {
            const episodeUrl = $(`a[href*="s${season}e${episode}"]`).attr('href') || $(`a[href*="s${season}e0${episode}"]`).attr('href') || $(`a[href*="e${episode}"]`).attr('href') || $(`a[href*="e0${episode}"]`).attr('href');

            const videoPageHtml = await rp({
                uri: `${url}${episodeUrl}`,
                headers: {
                    'x-real-ip': req.client.remoteAddress,
                    'x-forwarded-for': req.client.remoteAddress
                },
                jar,
                timeout: 5000
            });

            $ = cheerio.load(videoPageHtml);

            $('.jw-player')
                .toArray()
                .map(player => $(player).data().id)
                .filter(serverUrl => !serverUrl.includes('trailer'))
                .forEach(async (serverUrl) => {
                    const videoPageHtml = await rp({
                        uri: `${url}${serverUrl}`,
                        method: 'POST',
                        headers: {
                            'x-real-ip': req.client.remoteAddress,
                            'x-forwarded-for': req.client.remoteAddress
                        },
                        formData: {
                            play: 'continue',
                            x: 715,
                            y: 490
                        },
                        jar,
                        timeout: 5000
                    });

                    $ = cheerio.load(videoPageHtml);

                    // This one might be needed, but so far, salt has been used over decrypt

                    // const code = /decrypt\("([^"]+)/g.exec(videoPageHtml)[1];
                    // const decode = Buffer.from(tor(Buffer.from(code, 'base64').toString('ascii')), 'base64').toString('ascii');
                    // console.log(decode);
                    // urls = [(i[0], i[1]) for i in re.findall(
                    //     '''file\s*:\s*["']([^"']+)['"].+?label\s*:\s*["'](\d+)p["']''', str(decode), re.DOTALL)
                    //         if int(i[1]) >= 720]
                    // for i in urls:
                    //     url = i[0]
                    //     quality = i[1] + 'p'
                    //     sources.append(
                    //         {'source': 'GVIDEO', 'quality': quality, 'language': 'en', 'url': url,
                    //          'direct': True,
                    //          'debridonly': False})

                    const code = /salt\("([^"]+)/g.exec(videoPageHtml)[1];
                    const decode = tor(Buffer.from(tor(code), 'base64').toString('ascii'));
                    const providerUrl = /(?:src=')(.*)(?:' scrolling)/g.exec(decode)[1];

                    const videoSourceUrl = await Openload(providerUrl, jar);
                    sse.send({videoSourceUrl, url, provider: 'https://openload.co', ipLocked: true}, 'result');
                });
        } else {
            // Not working because the stream is a .m3u8 and I haven't found a player that will work.

//             const page = await browser.newPage();
//             await page.goto(`${url}${videoId}`);
//             await page.waitFor('.jw-player');
//             const sourceIds = await page.$$eval('.jw-player', serverTabs => serverTabs.map(serverTab => serverTab.dataset.id));
//
//             async function scrape(sourceId) {
//                 await page.goto(`${url}${sourceId}`);
//                 await page.waitFor('input[type="image"]');
//                 await page.click('input[type="image"]');
//                 await page.waitFor(5000);
//                 const content = await page.content();
//                 // await page.screenshot({path: 'AfdahTV.png'});
//                 const videoSourceUrl = await page.evaluate(() => window.player && window.player.getPlaylist()[0].file);
//                 console.log(videoSourceUrl);
//                 sse.send({videoSourceUrl, url, provider}, 'result');
//             }
//
//             sourceIds.filter(sourceId => !sourceId.startsWith('/trailer')).forEach(sourceId => {
//                 promises.push(scrape(sourceId))
//             });
        }
    } catch (err) {
        console.log(err);
        if (err.cause && err.cause.code !== 'ETIMEDOUT') {
            console.error(err);
            sse.send({url, message: 'Looks like this provider is down.'}, 'error');
        }
    }
}

function tor(txt) {
    try {
        let map = {};
        let tmp = "abcdefghijklmnopqrstuvwxyz";
        let buf = "";
        let j = 0;
        for (c of tmp) {
            let x = tmp[j];
            let y = tmp[(j + 13) % 26];
            map[x] = y;
            map[x.toUpperCase()] = y.toUpperCase();
            j += 1;
        }

        j = 0;
        for (let c of txt) {
            c = txt[j];
            if (c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z') {
                buf += map[c];
            } else {
                buf += c
            }
            j += 1
        }

        return buf;
    } catch(err) {
        return;
    }
}

module.exports = exports = AfdahTV;