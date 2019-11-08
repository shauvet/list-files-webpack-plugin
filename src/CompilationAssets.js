/*
 * @Date: 2019-11-08 22:58:58
 * @LastEditors: guangling
 * @LastEditTime: 2019-11-08 22:59:12
 */
'use strict';

class CompilationAssets
{
  constructor(content)
  {
    if ( content === undefined ) {
      throw new Error('content is required');
    }

    this.content = content.toString();
  }

  source()
  {
    return this.content;
  }

  size()
  {
    return this.content.length;
  }
}

module.exports = CompilationAssets;