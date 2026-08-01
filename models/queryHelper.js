'use strict';

class QueryWrapper {
    constructor(promise) {
        this.promise = promise;
        this._sortObj = null;
        this._skip = 0;
        this._limit = Infinity;
        this._selectFields = null;
    }
    select(fields) {
        this._selectFields = fields;
        return this;
    }
    populate(fields) {
        return this;
    }
    sort(order) {
        this._sortObj = order;
        return this;
    }
    skip(n) {
        this._skip = n || 0;
        return this;
    }
    limit(n) {
        this._limit = n || Infinity;
        return this;
    }
    lean() {
        return this;
    }
    async _resolve() {
        let result = await this.promise;
        if (Array.isArray(result)) {
            if (this._sortObj) {
                if (typeof this._sortObj === 'function') {
                    result.sort(this._sortObj);
                } else if (typeof this._sortObj === 'object') {
                    const keys = Object.keys(this._sortObj);
                    if (keys.length > 0) {
                        const key = keys[0];
                        const dir = this._sortObj[key];
                        result.sort((a, b) => {
                            const valA = a[key];
                            const valB = b[key];
                            if (valA < valB) return dir === -1 ? 1 : -1;
                            if (valA > valB) return dir === -1 ? -1 : 1;
                            return 0;
                        });
                    }
                }
            }
            if (this._skip > 0 || this._limit !== Infinity) {
                result = result.slice(this._skip, this._skip + this._limit);
            }
        }
        return result;
    }
    then(onFulfilled, onRejected) {
        return this._resolve().then(onFulfilled, onRejected);
    }
    catch(onRejected) {
        return this._resolve().catch(onRejected);
    }
}

function wrapQuery(promise) {
    if (promise && promise instanceof QueryWrapper) return promise;
    return new QueryWrapper(promise);
}

module.exports = { wrapQuery, QueryWrapper };
