// widget_embedder.js

// XXX ToDo: Consider about namespaces.

const B_HTTP = 'http://b.hatena.ne.jp/';
const B_STATIC_HTTP = 'http://b.st-hatena.com/';

var SiteinfoRequestor = {
    init: function SR_init() {
        var self = SiteinfoRequestor;

        Connect()
            .send("SiteinfoManager.getSiteinfoForURL", document.documentURI)
            .recv(function(event) {
                var siteinfo = event.message;
                self.onGotSiteinfo(siteinfo);
            })
            .close();
    },

    destroy: function SR_destroy() {
        // TODO: ここは何もしてない
        var self = SiteinfoRequestor;
        // XXX Can we remove the listener 'onMessage'?
    },

    onMessage: function SR_onMessage(info) {
        var self = SiteinfoRequestor;
        switch (info.message) {
        case 'siteinfo_for_url':
            self.onGotSiteinfo(info.siteinfo);
            break;
        case 'siteinfos_with_xpath':
            self.onGotXPathSiteinfos(info.siteinfos);
            break;
        }
    },

    onGotSiteinfo: function SR_onGotSiteinfo(siteinfo) {
        var self = SiteinfoRequestor;
        if (siteinfo) {
            if (!siteinfo.disable)
                new WidgetEmbedder(siteinfo);
            self.destroy();
            return;
        }
        Connect()
            .send("SiteinfoManager.getSiteinfosWithXPath", { })
            .recv(function(event) {
                var siteinfos = event.message;
                self.onGotXPathSiteinfos(siteinfos);
            })
            .close();
    },

    onGotXPathSiteinfos: function SR_onGotXPathSiteinfos(siteinfos) {
        var self = SiteinfoRequestor;

        for (var i = 0, n = siteinfos.length; i < n; i++) {
            var siteinfo = siteinfos[i];

            if (queryXPathOfType(siteinfo.domain, document, XPathResult.BOOLEAN_TYPE)) {
                if (!siteinfo.disable) {
                    new WidgetEmbedder(siteinfo);
                }
                break;
            }
        }
        self.destroy();
    },
};

function WidgetEmbedder(siteinfo) {
    this.siteinfo = siteinfo;
    this.embedLater(WidgetEmbedder.INITIAL_DELAY);
    document.addEventListener('DOMNodeInserted', this, false);
    document.addEventListener('AutoPagerize_DOMNodeInserted', this, false);
    document.addEventListener('AutoPatchWork.DOMNodeInserted', this, false);
}

extend(WidgetEmbedder, {
    INITIAL_DELAY:   20,
    MUTATION_DELAY: 100,

    locales: {
        en: {
            SHOW_ENTRY_TEXT:  '[Show on Hatena Bookmark]',
            SHOW_ENTRY_TITLE: 'Show This Entry on Hatena Bookmark',
            SHOW_COMMENTS_TEXT: '[Show comments in Popup]',
            SHOW_COMMENTS_TITLE: 'Show This Entry\'s comments in Popup'
        },
        ja: {
            SHOW_ENTRY_TEXT:  '[はてなブックマークで表示]',
            SHOW_ENTRY_TITLE: 'このエントリーをはてなブックマークで表示',
            SHOW_COMMENTS_TEXT: '[このエントリーのコメント一覧をポップアップ表示]',
            SHOW_COMMENTS_TITLE: 'このエントリーのコメント一覧をポップアップ表示'
        },
    },
});

WidgetEmbedder.messages =
    WidgetEmbedder.locales[navigator.language] ||
    WidgetEmbedder.locales[navigator.language.substring(0, 2)] ||
    WidgetEmbedder.locales['en'];

extend(WidgetEmbedder.prototype, {
    embedLater: function WE_embedLater(delay) {
        if (this.timerId) return;
        this.timerId = setTimeout(function (self) {
            self.embed();
            self.timerId = 0;
        }, delay, this);
    },

    embed: function WE_embed() {
        queryXPathAll(this.siteinfo.paragraph)
            .forEach(this.embedInParagraph, this);
    },

    embedInParagraph: function WE_embedInParagraph(paragraph) {
        if (paragraph._hb_isWidgetEmbedded) return;
        paragraph._hb_isWidgetEmbedded = true;

        var link = this.getLink(paragraph);
        if (!link || !/^http:/.test(link.href)) return;
        var url = link.href;
        var existing = this.getExistingWidgets(paragraph, link);
        var counter = existing.counter;
        var image = existing.counterImage;
        var counterAdded = false;
        if (!counter) {
            var point = this.getAnnotationPoint(paragraph, link, existing);
            if (!point) return;
            counter = this.createCounter(url);
            image = counter.firstChild;
            var fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(' '));
            fragment.appendChild(counter);
            point.insertNode(fragment);
            point.detach();
            counterAdded = true;
        }
        if (existing.comments) return;

        var self = this;
        function onCounterReady() {
            if (image) {
                image.removeEventListener('load', onCounterReady, false);
                image.removeEventListener('error', onCounterReady, false);
                image.removeEventListener('abort', onCounterReady, false);
                if (image.naturalWidth <= 1) {
                    // カウンタがもともと存在しなければ消す
                    if (counterAdded) {
                        counter.parentNode.removeChild(counter);
                    }
                    return;
                }
            }
            if (counterAdded)
                counter.style.display = '';
            var fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(' '));
            fragment.appendChild(self.createComments(url));
            counter.parentNode.insertBefore(fragment, counter.nextSibling);
        }

        if (!image || image.complete) {
            onCounterReady();
        } else {
            image.addEventListener('load', onCounterReady, false);
            image.addEventListener('error', onCounterReady, false);
            image.addEventListener('abort', onCounterReady, false);
        }
    },

    getLink: function WE_getLink(paragraph) {
        var xpath = this.siteinfo.link || '.';
        if (xpath === '__location__') {
            var url = document.documentURI;
            for (var node = paragraph; node; node = node.parentNode) {
                if (node._hb_baseURL) {
                    url = node._hb_baseURL;
                    break;
                }
            }
            var a = document.createElement('a');
            a.href = url;
            return a;
        }
        var link = queryXPath(xpath, paragraph);
        return (link && link.href) ? link : null;
    },

    getAnnotationPoint: function WE_getAnnotationPoint(paragraph, link, existing) {
        var point = document.createRange();
        var anchor = existing.entry || existing.comments || existing.addButton;
        if (anchor) {
            point.selectNode(anchor);
            point.collapse(anchor !== existing.entry);
            return point;
        }

        var annotation = this.siteinfo.annotation
                         ? queryXPath(this.siteinfo.annotation, paragraph)
                         : link;
        if (!annotation) return null;
        var position = (this.siteinfo.annotationPosition || '').toLowerCase();
        if (!position) {
            switch (annotation.localName) {
            case 'a': case 'br': case 'hr': case 'img': case 'canvas':
            case 'object': case 'input': case 'button': case 'select':
            case 'textarea':
                position = 'after';
                break;
            default:
                position = 'last';
            }
        }
        if (position === 'before' || position === 'after')
            point.selectNode(annotation);
        else
            point.selectNodeContents(annotation);
        point.collapse(position === 'before' || position === 'start');
        return point;
    },

    getExistingWidgets: function WE_getExistingWidgets(paragraph, link) {
        const url = link.href;
        const sharpEscapedURL = url.replace(/#/g, '%23');
        const entryURL = getEntryURL(url);
        const oldEntryURL = B_HTTP + 'entry/' + sharpEscapedURL;
        const imageAPIPrefix = B_STATIC_HTTP + 'entry/image/';
        const oldImageAPIPrefix = B_HTTP + 'entry/image/';
        const addURL = B_HTTP + 'entry/add/' + sharpEscapedURL;
        const oldAddURL = B_HTTP + 'my/add.confirm?url=' + encodeURIComponent(url);
        const oldAddURL2 = B_HTTP + 'append?' + sharpEscapedURL;
        const entryImagePrefix = 'http://d.hatena.ne.jp/images/b_entry';
        var widgets = {
            entry:        null,
            counter:      null,
            counterImage: null,
            comments:     null,
            addButton:    null,
        };
        queryXPathAll('descendant::a[@href]', paragraph).forEach(function (a) {
            switch (a.href) {
            case entryURL:
            case oldEntryURL:
                var content = a.firstChild;
                if (!content) break;
                if (content.nodeType === Node.TEXT_NODE) {
                    if (content.nodeValue.indexOf(' user') !== -1) {
                        var parentName = a.parentNode.localName;
                        widgets.counter =
                            (parentName === 'em' || parentName === 'strong')
                            ? a.parentNode : a;
                        break;
                    }
                    if (!content.nextSibling) break;
                    content = content.nextSibling;
                }
                if (content.localName === 'img') {
                    var src = content.src || '';
                    if (src.indexOf(imageAPIPrefix) === 0 ||
                        src.indexOf(oldImageAPIPrefix) === 0) {
                        widgets.counter = a;
                        widgets.counterImage = content;
                    } else if (src.indexOf(entryImagePrefix) === 0) {
                        widgets.entry = a;
                    }
                }
                break;

            case addURL:
            case oldAddURL:
            case oldAddURL2:
                widgets.addButton = a;
                break;
            }
        }, this);
        widgets.comments = paragraph.querySelector('.hatena-bcomment-view-icon');
        return widgets;
    },

    createCounter: function WE_createCounter(url) {
        var image = E('img', {
            src: B_STATIC_HTTP + 'entry/image/' + url.replace(/#/g, '%20'),
            alt: WidgetEmbedder.messages.SHOW_ENTRY_TEXT,
        });
        var counter = E('a', {
            href: getEntryURL(url),
            title: WidgetEmbedder.messages.SHOW_ENTRY_TITLE,
            'class': 'hBookmark-widget-counter',
            style: 'display: none;',
        }, image);
        return counter;
    },

    createComments: function WE_createComments(url) {
        var image = E('img', {
            src: "http://b.st-hatena.com/images/b-comment-balloon.png",
            alt: WidgetEmbedder.messages.SHOW_COMMENTS_TEXT,
        });
        var comments = E('a', {
            href: getEntryURL(url),
            title: WidgetEmbedder.messages.SHOW_COMMENTS_TITLE,
            'class': 'hBookmark-widget-comments'
        }, image);
        comments.addEventListener("click", function (ev) {
            if (ev.button)
                return;

            ev.stopPropagation();
            ev.preventDefault();

            safari.self.tab.dispatchMessage("showPopup", {
                url  : url,
                view : "comment"
            });

            Connect().send("PopupManager.show", { url : url, view : "comment" }).recv(function (ev) {}).close();
        }, false);
        return comments;
    },

    handleEvent: function WE_handleEvent(event) {
        switch (event.type) {
        case 'AutoPagerize_DOMNodeInserted':
        case 'AutoPatchWork.DOMNodeInserted':
            document.removeEventListener('DOMNodeInserted', this, false);
            event.target._hb_baseURL = event.newValue;
            /* FALL THROUGH */
        case 'DOMNodeInserted':
            this.embedLater(WidgetEmbedder.MUTATION_DELAY);
            break;
        }
    },
});

function extend(dest, src) {
    for (var i in src)
        dest[i] = src[i];
    return dest;
}

function queryXPath(xpath, context) {
    return queryXPathOfType(xpath, context,
                            XPathResult.FIRST_ORDERED_NODE_TYPE);
}

function queryXPathAll(xpath, context) {
    return queryXPathOfType(xpath, context,
                            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE);
}

function queryXPathOfType(xpath, context, type) {
    context = context || document;
    var doc = context.ownerDocument || context;
    var result = doc.evaluate(xpath, context, null, type, null);

    switch (result.resultType) {
    case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
    case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
        var nodes = [];
        for (var i = 0, n = result.snapshotLength; i < n; i++)
            nodes.push(result.snapshotItem(i));
        return nodes;
    case XPathResult.ANY_UNORDERED_NODE_TYPE:
    case XPathResult.FIRST_ORDERED_NODE_TYPE:
        return result.singleNodeValue;

    case XPathResult.NUMBER_TYPE:  return result.numberValue;
    case XPathResult.STRING_TYPE:  return result.stringValue;
    case XPathResult.BOOLEAN_TYPE: return result.booleanValue;
    case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
    case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
        return result;
    }
    throw new Error("Unknown XPath result type.");
}

function E(name, attrs) {
    var element = document.createElement(name);
    for (var a in attrs)
        element.setAttribute(a, attrs[a]);
    for (var i = 2, n = arguments.length; i < n; i++) {
        var child = arguments[i];
        if (!child.nodeType)
            child = document.createTextNode(child);
        element.appendChild(child);
    }
    return element;
}

function getEntryURL(url) {
    var suffix = url.replace(/#/g, '%23');
    if (suffix.indexOf('http://') === 0)
        suffix = suffix.substring(7);
    else if (suffix.indexOf('https://') === 0)
        suffix = 's/' + suffix.substring(8);
    return B_HTTP + 'entry/' + suffix;
}


if (window.top == window.self) {
    Connect()
        .send("Config.get", { key : 'content.webinfo.enabled'}).recv(function (ev) {
            if (ev.message)
                SiteinfoRequestor.init();
        })
        .close();
}
