import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_FILES = 50;

function getCacheDir() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'tahoe-control-center@local', 'art']);
}

function sha256hex(str) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, str, -1);
}

export function setArtOnWidget(widget, localPath) {
    if (!widget) return;
    if (!localPath) {
        widget.style = '';
        return;
    }
    try {
        const uri = GLib.filename_to_uri(localPath, null);
        // Reject any unexpected quote/paren characters to prevent style injection
        if (!uri || /["'()\n\r]/.test(uri)) {
            widget.style = '';
            return;
        }
        widget.style = `background-image: url("${uri}"); background-size: cover; background-position: center;`;
    } catch (e) {
        widget.style = '';
    }
}

export class ArtCache {
    constructor({fetchRemoteArt = true} = {}) {
        this._fetchRemoteArt = fetchRemoteArt;
        this._session = null;
    }

    setFetchRemoteArt(enabled) {
        this._fetchRemoteArt = Boolean(enabled);
    }

    _getSession() {
        if (!this._session)
            this._session = new Soup.Session({timeout: 10});
        return this._session;
    }

    async resolveArt(artUrl, cancellable = null) {
        if (!artUrl || typeof artUrl !== 'string')
            return null;

        if (artUrl.startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(artUrl);
                await new Promise((resolve, reject) => {
                    file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT, cancellable, (src, res) => {
                            try {
                                src.query_info_finish(res);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        });
                });
                return file.get_path();
            } catch (e) {
                return null;
            }
        }

        if (artUrl.startsWith('http://') || artUrl.startsWith('https://')) {
            if (!this._fetchRemoteArt)
                return null;

            const cacheDir = getCacheDir();
            const cachePath = GLib.build_filenamev([cacheDir, sha256hex(artUrl)]);
            const cacheFile = Gio.File.new_for_path(cachePath);

            // Return cached file if already present
            const cachedExists = await new Promise(resolve => {
                cacheFile.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT, cancellable, (src, res) => {
                        try {
                            src.query_info_finish(res);
                            resolve(true);
                        } catch (e) {
                            resolve(false);
                        }
                    });
            });
            if (cachedExists)
                return cachePath;

            try {
                const session = this._getSession();
                const msg = Soup.Message.new('GET', artUrl);
                if (!msg) return null;

                const bytes = await new Promise((resolve, reject) => {
                    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable, (src, res) => {
                        try {
                            resolve(src.send_and_read_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                if (cancellable?.is_cancelled()) return null;
                if (msg.get_status() !== Soup.Status.OK) return null;

                const [contentType] = msg.get_response_headers().get_content_type();
                if (!contentType || !contentType.startsWith('image/'))
                    return null;

                const size = bytes?.get_size?.() ?? 0;
                if (size <= 0 || size > MAX_BYTES)
                    return null;

                GLib.mkdir_with_parents(cacheDir, 0o755);

                const data = bytes.toArray();
                await new Promise((resolve, reject) => {
                    cacheFile.replace_contents_async(
                        data,
                        null,
                        false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION,
                        cancellable,
                        (src, res) => {
                            try {
                                src.replace_contents_finish(res);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });

                this._pruneCache(cacheDir).catch(() => {});
                return cachePath;
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    async _pruneCache(cacheDir) {
        const dir = Gio.File.new_for_path(cacheDir);
        const enumerator = await new Promise((resolve, reject) => {
            dir.enumerate_children_async('standard::name,time::modified',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, null, (src, res) => {
                    try { resolve(src.enumerate_children_finish(res)); } catch (e) { reject(e); }
                });
        });

        const entries = [];
        while (true) {
            const files = await new Promise((resolve, reject) => {
                enumerator.next_files_async(32, GLib.PRIORITY_LOW, null, (src, res) => {
                    try { resolve(src.next_files_finish(res)); } catch (e) { reject(e); }
                });
            });
            if (!files || files.length === 0) break;
            for (const info of files) {
                entries.push({
                    name: info.get_name(),
                    mtime: info.get_attribute_uint64('time::modified'),
                });
            }
        }

        if (entries.length <= MAX_FILES) return;
        entries.sort((a, b) => a.mtime - b.mtime);
        const toDelete = entries.slice(0, entries.length - MAX_FILES);
        for (const item of toDelete) {
            const f = dir.get_child(item.name);
            f.delete_async(GLib.PRIORITY_LOW, null, null);
        }
    }

    destroy() {
        if (this._session) {
            try { this._session.abort(); } catch (e) {}
            this._session = null;
        }
    }
}
